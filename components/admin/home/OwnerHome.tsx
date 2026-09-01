"use client";

import Link from "next/link";
import { useSales } from "@/lib/admin/sales-context";
import { useRent } from "@/lib/admin/rent-context";
import { useCash } from "@/lib/admin/cash-context";
import { useSettledStatements } from "@/lib/admin/settlements-context";
import { fmt } from "@/lib/admin/calc";
import { StatCard, SectionTitle, MockBanner, Button, PlusIcon } from "@/components/admin/ui";
import Cockpit from "@/components/admin/cockpit/Cockpit";
import GetSetUp from "@/components/admin/home/GetSetUp";
import ShopCoach from "@/components/admin/home/ShopCoach";
import { PageHead, StatementsTable, daysAgoLocal } from "./shared";

// Owner: the whole shop. What needs a decision, the coach, one row of numbers,
// and every chair's next step. The full money story lives on /admin/money.
export default function OwnerHome() {
  const { sales, real, loading } = useSales();
  const { outstandingCents: rentOutstanding, overdue } = useRent();
  const { outstandingCents: cashOutstanding } = useCash();
  const { statements: settled, holdingForRenters } = useSettledStatements();

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
  // vs the prior 7 days — hidden when last week had nothing to compare against.
  const deltaVs = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
  const dGross = deltaVs(sum(wk, gross), sum(prev, gross));

  return (
    <div>
      <PageHead
        title="Shop Overview"
        sub={real ? "Live" : "Period to date · preview data"}
        action={
          <Button href="/admin/clients" icon={<PlusIcon />}>
            New client
          </Button>
        }
      />

      {/* First-run setup card — self-retires once the pages are dressed. */}
      <GetSetUp />

      <Cockpit />

      {/* The shop coach — same reads as the app's shop home. */}
      <ShopCoach />

      {!real && !loading && <MockBanner source="Stripe" />}

      {/* One row of numbers, one range (Scott, 2026-09-01: the old page stacked
          a six-tile week strip on four period tiles on five glance tiles). The
          week's take with its trend, then the three amounts that are someone
          else's money until you move them. Everything else is on Money. */}
      <SectionTitle
        action={
          <Link href="/admin/money" className="text-xs font-medium text-brand">
            All money →
          </Link>
        }
      >
        This week <span className="font-normal text-white/50">· last 7 days</span>
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Gross"
          value={fmt(wkService + wkTips)}
          sub={`${wk.length} ticket${wk.length === 1 ? "" : "s"}${dGross == null ? "" : ` · ${dGross >= 0 ? "+" : ""}${Math.round(dGross * 100)}% vs last week`}`}
          accent
        />
        <StatCard
          label="Holding for renters"
          value={fmt(holdingForRenters)}
          sub="their card money, hand it over"
          tone={holdingForRenters > 0 ? "warn" : "neutral"}
        />
        <StatCard
          label="Cash to reconcile"
          value={fmt(cashOutstanding)}
          sub="logged, not yet counted"
          tone={cashOutstanding > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Rent outstanding"
          value={fmt(rentOutstanding)}
          sub={overdue.length ? `${overdue.length} overdue` : "this cycle"}
          tone={rentOutstanding > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-4">
        <StatementsTable statements={statements} />
      </div>
    </div>
  );
}
