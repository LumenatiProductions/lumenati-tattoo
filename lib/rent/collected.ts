import type { SupabaseClient } from "@supabase/supabase-js";

// THE booth-rent number. Every surface that says "rent collected" or "rent
// outstanding" (Overview, Reports, Profit & Loss, the Rent page, the app)
// reads the in-house engine's invoices through this one helper, so the same
// month never reads three different ways (Scott, 2026-09-01: one rent number).
//
// rent_invoices is the source: a paid invoice is rent collected for its
// period, a pending one is rent outstanding. Every real payment path (Stripe
// rent link, cash receive, marked paid on the Rent page) flips the invoice,
// so this matches the ledger for real money; the ledger's rent rows stay the
// audit trail, not the headline.

export type RentPeriod = { collectedCents: number; outstandingCents: number; invoices: number };

// `fromPeriod`/`toPeriod` are "YYYY-MM" (inclusive). Returns one entry per
// period that has invoices, plus the range total.
export async function rentByPeriod(
  db: SupabaseClient,
  shopId: string,
  fromPeriod: string,
  toPeriod: string,
): Promise<{ byPeriod: Map<string, RentPeriod>; total: RentPeriod; configured: boolean }> {
  const byPeriod = new Map<string, RentPeriod>();
  const total: RentPeriod = { collectedCents: 0, outstandingCents: 0, invoices: 0 };
  const { data } = await db
    .from("rent_invoices")
    .select("amount_cents, status, period")
    .eq("shop_id", shopId)
    .gte("period", fromPeriod)
    .lte("period", toPeriod);
  const rows = (data ?? []) as { amount_cents: number | null; status: string; period: string }[];
  for (const inv of rows) {
    const cents = inv.amount_cents ?? 0;
    const cell = byPeriod.get(inv.period) ?? { collectedCents: 0, outstandingCents: 0, invoices: 0 };
    cell.invoices += 1;
    total.invoices += 1;
    if (inv.status === "paid") {
      cell.collectedCents += cents;
      total.collectedCents += cents;
    } else if (inv.status === "pending") {
      cell.outstandingCents += cents;
      total.outstandingCents += cents;
    }
    byPeriod.set(inv.period, cell);
  }
  return { byPeriod, total, configured: rows.length > 0 };
}
