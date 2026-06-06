"use client";

import { useSales } from "@/lib/admin/sales-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useRent } from "@/lib/admin/rent-context";
import { CASH_LOG } from "@/lib/admin/mock-data";
import { shopSummary, statementFor, fmt } from "@/lib/admin/calc";
import { StatCard, Card, SectionTitle, MockBanner } from "@/components/admin/ui";
import Cockpit from "@/components/admin/cockpit/Cockpit";
import { PageHead, WeekTile, StatementsTable, RentPanel } from "./shared";

// Owner: the whole shop. The cross-feature cockpit (POS-STARTER-4) on top, then
// the financial overview.
export default function OwnerHome() {
  const { sales, real } = useSales();
  const { artists } = useArtists();
  const { invoices: rent, outstandingCents: rentOutstanding, collectedCents: rentCollected, overdue } = useRent();

  const s = shopSummary(artists, sales, []);
  const statements = artists
    .map((a) => statementFor(a, sales, []))
    .sort((x, y) => y.grossService - x.grossService);
  const cashOutstanding = CASH_LOG.filter((c) => !c.reconciled).reduce((a, c) => a + c.amountCents, 0);

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const wk = sales.filter((s2) => s2.date >= weekAgo);
  const wkService = wk.reduce((a, s2) => a + s2.serviceCents, 0);
  const wkTips = wk.reduce((a, s2) => a + s2.tipCents, 0);
  const wkCard = wk.filter((s2) => s2.method !== "cash").reduce((a, s2) => a + s2.serviceCents + s2.tipCents, 0);
  const wkCash = wk.filter((s2) => s2.method === "cash").reduce((a, s2) => a + s2.serviceCents + s2.tipCents, 0);

  return (
    <div>
      <PageHead title="Shop Overview" sub={real ? "Live from Square" : "Period to date · preview data"} />

      <Cockpit />

      {!real && <MockBanner source="Square & QuickBooks" />}

      <SectionTitle>
        This week <span className="font-normal text-black/35">· last 7 days, same as your Monday email</span>
      </SectionTitle>
      <Card className="mb-5">
        <div className="grid grid-cols-3 divide-x divide-y divide-black/5 sm:grid-cols-6 sm:divide-y-0">
          <WeekTile label="Gross" value={fmt(wkService + wkTips)} strong />
          <WeekTile label="Service" value={fmt(wkService)} />
          <WeekTile label="Tips" value={fmt(wkTips)} />
          <WeekTile label="Card" value={fmt(wkCard)} />
          <WeekTile label="Cash" value={fmt(wkCash)} />
          <WeekTile label="Tickets" value={String(wk.length)} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross sales" value={fmt(s.grossSales)} sub="service + tips" />
        <StatCard
          label="Shop revenue"
          value={fmt(s.splitRevenue + rentCollected)}
          sub={`${fmt(s.splitRevenue)} splits + ${fmt(rentCollected)} rent`}
          accent
        />
        <StatCard label="Payouts owed" value={fmt(s.payoutsOwed)} sub="shop → artists" tone="warn" />
        <StatCard
          label="Cash to reconcile"
          value={fmt(cashOutstanding)}
          sub="in the drawer"
          tone={cashOutstanding > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
