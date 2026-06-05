"use client";

import { useRent } from "@/lib/admin/rent-context";
import { fmt } from "@/lib/admin/calc";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";

export default function RentPage() {
  const { invoices, loading, outstandingCents, collectedCents, overdue } = useRent();

  const unpaid = invoices.filter((i) => !i.paid).sort((a, b) => (a.dueDate || "") < (b.dueDate || "") ? -1 : 1);
  const paid = invoices.filter((i) => i.paid);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Booth Rent</h1>
        <p className="text-sm text-black/50">Live from Square invoices. Who&apos;s paid, who&apos;s behind.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Outstanding" value={fmt(outstandingCents)} tone={outstandingCents ? "warn" : "good"} accent />
        <StatCard label="Overdue" value={String(overdue.length)} tone={overdue.length ? "warn" : "good"} sub={overdue.length ? "past due date" : "none"} />
        <StatCard label="Collected" value={fmt(collectedCents)} tone="good" sub="paid this cycle" />
        <StatCard label="Invoices" value={String(invoices.length)} />
      </div>

      <SectionTitle>Outstanding</SectionTitle>
      <Card className="mb-5">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-black/40">Loading from Square…</div>
        ) : unpaid.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-black/40">All rent is paid. 🎉</div>
        ) : (
          <div className="divide-y divide-black/5">
            {unpaid.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-black/45">
                    {i.title}
                    {i.dueDate && ` · due ${i.dueDate}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tnum text-sm font-semibold">{fmt(i.amountCents)}</span>
                  {i.overdue ? (
                    <Badge tone="bad">overdue</Badge>
                  ) : i.status === "SCHEDULED" ? (
                    <Badge>scheduled</Badge>
                  ) : (
                    <Badge tone="warn">unpaid</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {paid.length > 0 && (
        <>
          <SectionTitle>Paid</SectionTitle>
          <Card>
            <div className="divide-y divide-black/5">
              {paid.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-black/45">{i.title}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tnum text-sm text-black/55">{fmt(i.amountCents)}</span>
                    <Badge tone="good">paid</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
