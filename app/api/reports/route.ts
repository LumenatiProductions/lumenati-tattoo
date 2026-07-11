import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";
import { rowToArtist } from "@/lib/admin/artists-data";
import { shopSummary, statementFor } from "@/lib/admin/calc";
import { fetchRentInvoices, isSquareConfigured } from "@/lib/square/client";
import type { Sale } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

// Reports is the shop-wide / cross-artist financial view: admin
// only (artists see their own numbers on Payouts). Accepts BOTH the web admin's
// cookie session and the app's Bearer token; either way we resolve the role and
// then read with the service-role client (a privileged all-data aggregation that
// only admins reach). An artist gets a 403.
async function gate(req: Request): Promise<{ role: string | null; authed: boolean; shopId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("email", user.email!)
      .maybeSingle();
    return {
      role: profile?.role ?? null,
      authed: true,
      shopId: (profile?.shop_id as string | null) ?? null,
    };
  }
  const me = await userFromBearer(req);
  return me
    ? { role: me.role, authed: true, shopId: me.shopId }
    : { role: null, authed: false, shopId: null };
}

// Same `sales` row -> Sale mapping the SalesProvider uses, so the math matches
// the Payouts page exactly. Reports never falls back to mock data — an
// accountant's numbers must be the real rows or an honest empty state.
type SaleRow = {
  id: string;
  created_at: string | null;
  service_cents: number | null;
  tip_cents: number | null;
  method: string | null;
  artist_id: string | null;
};
// The ledger_sales view doesn't expose shop_id, so the window's sales come
// straight from the ledger with the shop filter, grouped the way the view
// groups: sale+tip rows, direction in, unreversed, keyed on external_id sans
// _svc/_tip per source, reversed originals excluded.
async function ledgerSalesForShop(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  shopId: string,
  from: string,
  toEnd: string,
): Promise<SaleRow[]> {
  type LedgerRow = {
    id: string;
    occurred_at: string;
    kind: string;
    amount_cents: number;
    artist_id: string | null;
    external_id: string | null;
    source: string;
  };
  const rows: LedgerRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data } = await db
      .from("ledger")
      .select("id, occurred_at, kind, amount_cents, artist_id, external_id, source")
      .eq("shop_id", shopId)
      .in("kind", ["sale", "tip"])
      .eq("direction", "in")
      .is("reverses", null)
      .not("external_id", "is", null)
      .gte("occurred_at", from)
      .lte("occurred_at", toEnd)
      .order("occurred_at", { ascending: true })
      .range(start, start + 999);
    rows.push(...((data ?? []) as LedgerRow[]));
    if (!data || data.length < 1000) break;
  }
  // Reversing rows can land outside the window (a refund months later), so
  // they're pulled un-windowed to exclude their originals.
  const reversed = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data } = await db
      .from("ledger")
      .select("reverses")
      .eq("shop_id", shopId)
      .not("reverses", "is", null)
      .range(start, start + 999);
    for (const r of data ?? []) if (r.reverses) reversed.add(r.reverses as string);
    if (!data || data.length < 1000) break;
  }
  const grouped = new Map<string, SaleRow>();
  for (const r of rows) {
    if (reversed.has(r.id)) continue;
    const id = (r.external_id ?? "").replace(/_(svc|tip)$/, "");
    const key = `${r.source}|${id}`;
    let g = grouped.get(key);
    if (!g) {
      grouped.set(key, (g = {
        id,
        created_at: r.occurred_at,
        service_cents: 0,
        tip_cents: 0,
        method: r.source === "cash" ? "cash" : "card",
        artist_id: null,
      }));
    }
    if (r.occurred_at < (g.created_at ?? "")) g.created_at = r.occurred_at;
    if (r.kind === "sale") g.service_cents = (g.service_cents ?? 0) + r.amount_cents;
    else g.tip_cents = (g.tip_cents ?? 0) + r.amount_cents;
    if (r.artist_id && (!g.artist_id || r.artist_id > g.artist_id)) g.artist_id = r.artist_id;
  }
  return [...grouped.values()];
}

const rowToSale = (r: SaleRow): Sale => ({
  id: r.id,
  artistId: r.artist_id ?? "",
  date: (r.created_at || "").slice(0, 10),
  serviceCents: r.service_cents ?? 0,
  tipCents: r.tip_cents ?? 0,
  method: r.method === "cash" ? "cash" : "card",
  squarePaymentId: r.id,
  description: "Square sale",
});

// Default range: calendar year-to-date. ISO yyyy-mm-dd in, yyyy-mm-dd out.
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  return { from: `${y}-01-01`, to: now.toISOString().slice(0, 10) };
}
const isISODate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const { role, authed, shopId } = await gate(req);
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !shopId || role !== "owner") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const url = new URL(req.url);
  const def = defaultRange();
  const from = isISODate(url.searchParams.get("from")) ? url.searchParams.get("from")! : def.from;
  const to = isISODate(url.searchParams.get("to")) ? url.searchParams.get("to")! : def.to;
  const toExclusiveEnd = `${to}T23:59:59.999`; // make `to` inclusive of its whole day

  // ── Pull the real rows in the window (service-role: admins see all) ──
  // PostgREST clamps any single select to 1000 rows regardless of .limit(),
  // so bookings page through the window like the ledger does.
  const bookingRows: { deposit_cents: number | null; deposit_status: string | null; starts_at: string }[] = [];
  const pageBookings = async () => {
    for (let start = 0; ; start += 1000) {
      const { data } = await db
        .from("bookings")
        .select("deposit_cents, deposit_status, starts_at")
        .eq("shop_id", shopId)
        .gte("starts_at", from)
        .lte("starts_at", toExclusiveEnd)
        .order("starts_at", { ascending: true })
        .range(start, start + 999);
      bookingRows.push(...((data ?? []) as typeof bookingRows));
      if (!data || data.length < 1000) break;
    }
  };
  const [artistsRes, salesRows, , inventoryRes] = await Promise.all([
    db.from("artists").select("*").eq("shop_id", shopId).eq("active", true).order("sort"),
    // Reads the canonical ledger (as sales-shaped rows) — the money source of truth.
    ledgerSalesForShop(db, shopId, from, toExclusiveEnd),
    pageBookings(),
    db.from("inventory_items").select("qty, cost_cents").eq("shop_id", shopId),
  ]);

  const artists = (artistsRes.data ?? []).map(rowToArtist);
  const sales = salesRows.map(rowToSale);

  // ── Shop + per-artist money math (reused from calc.ts, same as the Pay page) ──
  // Rent is billed out of band (invoices, below) and never nets against sales.
  const summary = shopSummary(artists, sales);
  const perArtist = artists
    .map((a) => {
      const st = statementFor(a, sales);
      return {
        id: a.id,
        name: a.name,
        color: a.color,
        payType: a.pay.type,
        splitPct: a.pay.shopSplitPct ?? 0,
        rentCents: a.pay.rentCents ?? 0,
        saleCount: st.saleCount,
        grossService: st.grossService,
        grossTips: st.grossTips,
        shopCut: st.shopCut,
        artistEarnings: st.artistEarnings, // renters: 1099 basis; splits: Gusto wages
        passThrough: st.passThroughOwed, // renter card sales held for hand-over
        gustoWages: st.gustoWages,
      };
    })
    .filter((a) => a.saleCount > 0 || a.payType !== "booth_rent") // hide renters with no tickets
    .sort((a, b) => b.grossService - a.grossService);

  // ── Deposits from bookings in the window ──
  const deposits = { held: 0, applied: 0, forfeited: 0, count: 0 };
  for (const b of bookingRows) {
    const c = (b.deposit_cents as number) ?? 0;
    if (c <= 0) continue;
    if (b.deposit_status === "held") deposits.held += c;
    else if (b.deposit_status === "applied") deposits.applied += c;
    else if (b.deposit_status === "forfeited") deposits.forfeited += c;
    else continue;
    deposits.count++;
  }

  // ── Supply on-hand value (current snapshot; we don't track purchase history) ──
  let supplyValueCents = 0;
  let supplyItems = 0;
  for (const it of inventoryRes.data ?? []) {
    supplyValueCents += ((it.qty as number) ?? 0) * ((it.cost_cents as number) ?? 0);
    supplyItems++;
  }

  // ── Rent from Square (not date-bounded — recurring booth rent status) ──
  let rentCollected = 0;
  let rentOutstanding = 0;
  let rentConfigured = false;
  if (isSquareConfigured) {
    try {
      const invoices = await fetchRentInvoices();
      rentConfigured = true;
      for (const inv of invoices as { amountCents: number; paid: boolean }[]) {
        if (inv.paid) rentCollected += inv.amountCents;
        else rentOutstanding += inv.amountCents;
      }
    } catch {
      /* leave rent at 0; the rest of the report still stands */
    }
  }

  return NextResponse.json({
    range: { from, to },
    real: sales.length > 0,
    shop: {
      grossSales: summary.grossSales,
      serviceRevenue: summary.serviceRevenue,
      tips: summary.grossSales - summary.serviceRevenue,
      splitRevenue: summary.splitRevenue,
      rentCollected,
      rentOutstanding,
      // shop's total take = service splits + forfeited deposits + rent collected
      shopRevenue: summary.splitRevenue + deposits.forfeited + rentCollected,
      cardTotal: summary.cardTotal,
      cashTotal: summary.cashTotal,
      renterPassThrough: summary.renterPassThrough,
      gustoWages: summary.gustoWagesDue,
    },
    artists: perArtist,
    deposits,
    expenses: { supplyValueCents, supplyItems },
    rentConfigured,
  });
}
