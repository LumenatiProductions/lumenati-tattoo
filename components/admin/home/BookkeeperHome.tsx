"use client";

import Link from "next/link";
import { useSales } from "@/lib/admin/sales-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useRent } from "@/lib/admin/rent-context";
import { useCash } from "@/lib/admin/cash-context";
import { useSettledStatements } from "@/lib/admin/settlements-context";
import { shopSummary, fmt } from "@/lib/admin/calc";
import { StatCard, MockBanner } from "@/components/admin/ui";
import { PageHead, StatementsTable, RentPanel } from "./shared";

// Bookkeeper: numbers only, no operational clutter. Revenue, what's owed, what's
// outstanding, and a straight line to Reports. (Owner gets the same money view
// plus the cross-feature cockpit; the bookkeeper doesn't need bookings/stock.)
export default function BookkeeperHome() {
  const { sales, real, loading } = useSales();
  const { artists } = useArtists();
  const { invoices: rent, outstandingCents: rentOutstanding, collectedCents: rentCollected, overdue } = useRent();
  const { outstandingCents: cashOutstanding } = useCash();
  const { statements: settled, payoutsOwed } = useSettledStatements();

  const s = shopSummary(artists, sales, []);
  const statements = [...settled].sort((x, y) => y.grossService - x.grossService);

  return (
    <div>
      <PageHead title="Books" sub={real ? "Live" : "Period to date · preview data"} />
      {!real && !loading && <MockBanner source="Square & QuickBooks" />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross sales" value={fmt(s.grossSales)} sub="service + tips" />
        <StatCard
          label="Shop revenue"
          value={fmt(s.splitRevenue + rentCollected)}
          sub={`${fmt(s.splitRevenue)} splits + ${fmt(rentCollected)} rent`}
          accent
        />
        <StatCard label="Payouts owed" value={fmt(payoutsOwed)} sub="shop → artists, since last settle" tone="warn" />
        <StatCard
          label="Cash to reconcile"
          value={fmt(cashOutstanding)}
          tone={cashOutstanding > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/reports" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          Open Reports →
        </Link>
        <Link href="/admin/payouts" className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium">
          Payouts
        </Link>
        <Link href="/admin/cash" className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium">
          Cash log
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StatementsTable statements={statements} />
        </div>
        <div>
          <RentPanel rent={rent} outstanding={rentOutstanding} overdueCount={overdue.length} />
        </div>
      </div>
    </div>
  );
}
