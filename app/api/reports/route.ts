import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";
import { rowToArtist } from "@/lib/admin/artists-data";
import { shopSummary, statementFor } from "@/lib/admin/calc";
import { fetchRentInvoices, isSquareConfigured } from "@/lib/square/client";
import type { Sale } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

// Reports is the shop-wide / cross-artist financial view: owner + bookkeeper
// only (artists see their own numbers on Payouts). Accepts BOTH the web admin's
// cookie session and the app's Bearer token; either way we resolve the role and
// then read with the service-role client (a privileged all-data aggregation that
// only owner/bookkeeper reach). An artist gets a 403.
async function gate(req: Request): Promise<{ role: string | null; authed: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", user.email!)
      .maybeSingle();
    return { role: profile?.role ?? null, authed: true };
  }
  const me = await userFromBearer(req);
  return me ? { role: me.role, authed: true } : { role: null, authed: false };
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
  const { role, authed } = await gate(req);
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !["owner", "bookkeeper"].includes(role)) {
    return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const url = new URL(req.url);
  const def = defaultRange();
  const from = isISODate(url.searchParams.get("from")) ? url.searchParams.get("from")! : def.from;
  const to = isISODate(url.searchParams.get("to")) ? url.searchParams.get("to")! : def.to;
  const toExclusiveEnd = `${to}T23:59:59.999`; // make `to` inclusive of its whole day

  // ── Pull the real rows in the window (service-role: owner/bookkeeper see all) ──
  const [artistsRes, salesRes, bookingsRes, inventoryRes] = await Promise.all([
    db.from("artists").select("*").eq("active", true).order("sort"),
    db
      .from("sales")
      .select("id, created_at, service_cents, tip_cents, method, artist_id")
      .gte("created_at", from)
      .lte("created_at", toExclusiveEnd)
      .limit(20000),
    db
      .from("bookings")
      .select("deposit_cents, deposit_status, starts_at")
      .gte("starts_at", from)
      .lte("starts_at", toExclusiveEnd)
      .limit(20000),
    db.from("inventory_items").select("qty, cost_cents"),
  ]);

  const artists = (artistsRes.data ?? []).map(rowToArtist);
  const sales = (salesRes.data ?? []).map(rowToSale);

  // ── Shop + per-artist money math (reused from calc.ts, same as Payouts) ──
  // Rent is settled out of band (Square invoices, below), so pass [] here and
  // fold rent in as its own revenue line rather than per-artist.
  const summary = shopSummary(artists, sales, []);
  const perArtist = artists
    .map((a) => {
      const st = statementFor(a, sales, []);
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
        artistEarnings: st.artistEarnings, // service kept + all tips = 1099 basis
        cardOwed: st.shopOwesArtist, // card share the shop pays out
        net: st.net,
      };
    })
    .filter((a) => a.saleCount > 0 || a.payType !== "rent") // hide pure-rent artists with no tickets
    .sort((a, b) => b.grossService - a.grossService);

  // ── Deposits from bookings in the window ──
  const deposits = { held: 0, applied: 0, forfeited: 0, count: 0 };
  for (const b of bookingsRes.data ?? []) {
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
      payoutsOwed: summary.payoutsOwed,
      collectFromArtists: summary.collectFromArtists,
    },
    artists: perArtist,
    deposits,
    expenses: { supplyValueCents, supplyItems },
    rentConfigured,
  });
}
