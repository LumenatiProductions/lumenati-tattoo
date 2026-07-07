import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceCart, decrementStock } from "@/lib/pos/merch";

export const dynamic = "force-dynamic";

// A CASH merch sale rung up at the register (phone POS or web cash page).
// Card merch goes through /api/terminal/payment-intent instead — this route is
// the cash leg. Body: { items: [{id, qty}] }. Prices and tax are computed
// server-side; the client only says WHAT sold.
//
// Books shape mirrors /api/cash exactly (same external_id scheme, so the cash
// page's delete/reversal flow works on these rows too):
//   cash_entries row  — amount tax-INCLUSIVE, tax_cents split out
//   ledger 'sale' row — net of tax, artist_id null (merch is shop revenue)
//   ledger 'tax' row  — the state's money, one SUM at remittance time
// then stock comes off, one inventory_log line per product.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { items?: { id?: string; qty?: number }[] };
  const priced = await priceCart(admin, b.items ?? [], me.shopId);
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: 400 });
  const { lines, subtotalCents, taxCents, totalCents } = priced.cart;

  const note = `Merch: ${lines.map((l) => `${l.qty}x ${l.name}`).join(", ")}`;
  const date = new Date().toISOString().slice(0, 10);

  const { data: entry, error } = await admin
    .from("cash_entries")
    .insert({
      shop_id: me.shopId,
      date,
      artist_id: null, // product sales are 100% shop revenue
      amount_cents: totalCents,
      tax_cents: taxCents,
      note,
      entered_by: me.email,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Same dual-write as /api/cash: sale net of tax + its own tax row. Best-effort
  // there, best-effort here — reconcile catches drift.
  const base = {
    shop_id: me.shopId,
    source: "cash",
    direction: "in",
    occurred_at: date,
    created_by: me.email,
    artist_id: null,
  };
  const ledgerRows: Record<string, unknown>[] = [
    { ...base, kind: "sale", amount_cents: subtotalCents, external_id: `cash_${entry.id}`, note },
  ];
  if (taxCents > 0) {
    ledgerRows.push({
      ...base,
      kind: "tax",
      amount_cents: taxCents,
      external_id: `cash_${entry.id}_tax`,
      note: "sales tax collected",
    });
  }
  await admin.from("ledger").insert(ledgerRows);

  await decrementStock(admin, lines, me.email, me.shopId);

  return NextResponse.json({
    entry,
    lines,
    subtotalCents,
    taxCents,
    totalCents,
  });
}
