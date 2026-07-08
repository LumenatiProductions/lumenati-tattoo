"use client";

import Link from "next/link";
import { useSales } from "@/lib/admin/sales-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useRent } from "@/lib/admin/rent-context";
import { useCash } from "@/lib/admin/cash-context";
import { useSettledStatements } from "@/lib/admin/settlements-context";
import { shopSummary, fmt } from "@/lib/admin/calc";
import { StatCard, Card, SectionTitle, MockBanner } from "@/components/admin/ui";
import Cockpit from "@/components/admin/cockpit/Cockpit";
import { PageHead, WeekTile, StatementsTable, RentPanel, daysAgoLocal } from "./shared";

// Owner: the whole shop. The cross-feature cockpit (POS-STARTER-4) on top, then
// the financial overview.
export default function OwnerHome() {
  const { sales, real, loading } = useSales();
  const { artists } = useArtists();
  const { invoices: rent, outstandingCents: rentOutstanding, collectedCents: rentCollected, overdue } = useRent();
  const { outstandingCents: cashOutstanding } = useCash();
  const { statements: settled, payoutsOwed } = useSettledStatements();

  const s = shopSummary(artists, sales, []);
  const statements = [...settled].sort((x, y) => y.grossService - x.grossService);

  const weekAgo = daysAgoLocal(7);
  const twoWeeksAgo = daysAgoLocal(14);
  const wk = sales.filter((s2) => s2.date >= weekAgo);
  const prev = sales.filter((s2) => s2.date >= twoWeeksAgo && s2.date < weekAgo);
  const sum = (rows: typeof sales, pick: (s2: (typeof sales)[number]) => number) =>
    rows.reduce((a, s2) => a + pick(s2), 0);
  const gross = (s2: (typeof sales)[number]) => s2.serviceCents + s2.tipCents;
  const wkService = sum(wk, (s2) => s2.serviceCents);
  const wkTips = sum(wk, (s2) => s2.tipCents);
  const wkCard = sum(wk.filter((s2) => s2.method !== "cash"), gross);
  const wkCash = sum(wk.filter((s2) => s2.method === "cash"), gross);
  // vs the prior 7 days — hidden when last week had nothing to compare against.
  const deltaVs = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
  const dGross = deltaVs(sum(wk, gross), sum(prev, gross));
  const dService = deltaVs(wkService, sum(prev, (s2) => s2.serviceCents));
  const dTips = deltaVs(wkTips, sum(prev, (s2) => s2.tipCents));
  const dCard = deltaVs(wkCard, sum(prev.filter((s2) => s2.method !== "cash"), gross));
  const dCash = deltaVs(wkCash, sum(prev.filter((s2) => s2.method === "cash"), gross));
  const dTickets = deltaVs(wk.length, prev.length);

  return (
    <div>
      <PageHead title="Shop Overview" sub={real ? "Live" : "Period to date · preview data"} />

      <Cockpit />

      {!real && !loading && <MockBanner source="Square & QuickBooks" />}

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/clients" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          New client
        </Link>
      </div>

      <SectionTitle>
        This week <span className="font-normal text-white/50">· last 7 days, same as your Monday email</span>
      </SectionTitle>
      <Card className="mb-5">
        <div className="grid grid-cols-3 divide-x divide-y divide-white/8 sm:grid-cols-6 sm:divide-y-0">
          <WeekTile label="Gross" value={fmt(wkService + wkTips)} strong delta={dGross} />
          <WeekTile label="Service" value={fmt(wkService)} delta={dService} />
          <WeekTile label="Tips" value={fmt(wkTips)} delta={dTips} />
          <WeekTile label="Card" value={fmt(wkCard)} delta={dCard} />
          <WeekTile label="Cash" value={fmt(wkCash)} delta={dCash} />
          <WeekTile label="Tickets" value={String(wk.length)} delta={dTickets} />
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
        <StatCard label="Payouts owed" value={fmt(payoutsOwed)} sub="shop → artists, since last settle" tone="warn" />
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
