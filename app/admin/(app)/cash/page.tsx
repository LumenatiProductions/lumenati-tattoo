"use client";

import { useState } from "react";
import { ARTISTS, CASH_LOG } from "@/lib/admin/mock-data";
import { fmt } from "@/lib/admin/calc";
import { Card, SectionTitle, Badge, Dot, StatCard, MockBanner } from "@/components/admin/ui";

export default function CashPage() {
  // Local-only reconcile toggles for the demo (persisting lands with the DB).
  const [reconciled, setReconciled] = useState<Record<string, boolean>>(
    Object.fromEntries(CASH_LOG.map((c) => [c.id, c.reconciled])),
  );

  const rows = [...CASH_LOG].sort((a, b) => (a.date < b.date ? 1 : -1));
  const outstanding = rows
    .filter((c) => !reconciled[c.id])
    .reduce((a, c) => a + c.amountCents, 0);
  const total = rows.reduce((a, c) => a + c.amountCents, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cash Log</h1>
        <p className="text-sm text-black/50">
          The shop runs a lot of cash. Log it at the desk, reconcile against the
          drawer, and it flows into the books.
        </p>
      </div>
      <MockBanner source="QuickBooks" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash logged" value={fmt(total)} sub="this period" />
        <StatCard
          label="Unreconciled"
          value={fmt(outstanding)}
          tone={outstanding ? "warn" : "good"}
        />
        <StatCard label="Entries" value={String(rows.length)} />
        <StatCard
          label="Reconciled"
          value={`${rows.filter((c) => reconciled[c.id]).length}/${rows.length}`}
          tone="good"
        />
      </div>

      <SectionTitle
        action={
          <button className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            + Log cash
          </button>
        }
      >
        Drawer entries
      </SectionTitle>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/40">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Who</th>
              <th className="px-4 py-2.5 font-medium">Note</th>
              <th className="px-4 py-2.5 font-medium">Entered by</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const a = ARTISTS.find((x) => x.id === c.artistId);
              const done = reconciled[c.id];
              return (
                <tr key={c.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 text-black/55">{c.date}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      {a ? <Dot color={a.color} /> : null}
                      {a?.name ?? "Shop"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{c.note}</td>
                  <td className="px-4 py-2.5 text-black/45">{c.enteredBy}</td>
                  <td className="tnum px-4 py-2.5 text-right font-medium">{fmt(c.amountCents)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setReconciled((r) => ({ ...r, [c.id]: !r[c.id] }))}
                      className="align-middle"
                      title="Toggle reconciled"
                    >
                      {done ? <Badge tone="good">reconciled</Badge> : <Badge tone="warn">open</Badge>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
