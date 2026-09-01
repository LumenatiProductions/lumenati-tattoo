"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRole } from "@/lib/admin/role-context";
import { FilterChips, PageHeader } from "@/components/admin/ui";
import PnlTab from "@/components/admin/money/PnlTab";
import ReportsTab from "@/components/admin/money/ReportsTab";
import PayTab from "@/components/admin/money/PayTab";
import GoalsTab from "@/components/admin/money/GoalsTab";
import RentTab from "@/components/admin/money/RentTab";
import CashTab from "@/components/admin/money/CashTab";
import ExpensesTab from "@/components/admin/money/ExpensesTab";
import ReconcileTab from "@/components/admin/money/ReconcileTab";

// Money. One page, one door, every money question behind a tab (Scott,
// 2026-09-01: seven finance pages became one). Each tab is the page it used to
// be, unchanged inside; the old URLs redirect here so nothing that linked to
// them breaks. Owners see the shop's books; artists see their own pay + goals.
type TabKey = "pnl" | "reports" | "pay" | "goals" | "rent" | "cash" | "expenses" | "reconcile";
const TABS: { key: TabKey; label: string; roles: string[] }[] = [
  { key: "pnl", label: "Profit & Loss", roles: ["owner"] },
  { key: "reports", label: "Reports", roles: ["owner"] },
  { key: "pay", label: "Pay", roles: ["owner", "artist"] },
  { key: "goals", label: "Goals", roles: ["artist"] },
  { key: "rent", label: "Booth rent", roles: ["owner"] },
  { key: "cash", label: "Cash", roles: ["owner"] },
  { key: "expenses", label: "Expenses", roles: ["owner"] },
  { key: "reconcile", label: "Reconcile", roles: ["owner"] },
];

export default function MoneyPage() {
  return (
    <Suspense fallback={null}>
      <MoneyInner />
    </Suspense>
  );
}

function MoneyInner() {
  const { role } = useRole();
  const router = useRouter();
  const params = useSearchParams();
  const tabs = TABS.filter((t) => t.roles.includes(role));
  const wanted = params.get("tab") as TabKey | null;
  const tab: TabKey = tabs.some((t) => t.key === wanted) ? (wanted as TabKey) : tabs[0]?.key ?? "pay";

  return (
    <div>
      <PageHeader
        title="Money"
        subtitle={
          role === "owner"
            ? "Everything about the shop's money in one place. Same numbers on every tab."
            : "Your pay, your goals, your tax set-aside."
        }
      />
      <FilterChips
        filters={tabs.map((t) => ({ key: t.key, label: t.label }))}
        value={tab}
        onChange={(k) => router.replace(`/admin/money?tab=${k}`, { scroll: false })}
      />
      <div className="mt-2">
        {tab === "pnl" && <PnlTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "pay" && <PayTab />}
        {tab === "goals" && <GoalsTab />}
        {tab === "rent" && <RentTab />}
        {tab === "cash" && <CashTab />}
        {tab === "expenses" && <ExpensesTab />}
        {tab === "reconcile" && <ReconcileTab />}
      </div>
    </div>
  );
}
