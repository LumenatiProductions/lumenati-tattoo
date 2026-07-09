import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// A booth renter pays rent in cash (page-walk note 12): the renter taps
// "paying in cash" on their own invoice, which puts an in-transit line on the
// handoff board. The invoice stays pending until the admin taps "Got it"
// (/api/cash/receive) with the stack in hand — that second tap marks it paid.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { invoiceId?: string; date?: string };
  if (!b.invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

  const { data: inv } = await me.db
    .from("rent_invoices")
    .select("id, artist_id, amount_cents, status, period")
    .eq("id", b.invoiceId)
    .eq("shop_id", me.shopId)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (me.role !== "owner" && inv.artist_id !== me.artistId) {
    return NextResponse.json({ error: "Not your invoice" }, { status: 403 });
  }
  if (inv.status !== "pending") return NextResponse.json({ error: "This invoice isn't open." }, { status: 409 });

  // One in-transit line per invoice — tapping twice doesn't double it.
  const { data: existing } = await me.db
    .from("cash_entries")
    .select("id")
    .eq("rent_invoice_id", inv.id)
    .eq("shop_id", me.shopId)
    .is("received_at", null)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, entryId: existing.id, already: true });

  const { data: entry, error } = await me.db
    .from("cash_entries")
    .insert({
      date: /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? (b.date as string) : new Date().toISOString().slice(0, 10),
      artist_id: inv.artist_id,
      amount_cents: inv.amount_cents,
      tax_cents: 0,
      note: `Booth rent ${inv.period} — cash`,
      entered_by: me.email,
      rent_invoice_id: inv.id,
      handed_off_at: new Date().toISOString(), // they're declaring the handoff
      shop_id: me.shopId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, entryId: entry.id });
}
