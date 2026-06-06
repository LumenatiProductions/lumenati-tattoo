"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import { toCsv, downloadCsv } from "@/lib/books/export";

type Row = {
  id: string;
  date: string;
  type: string;
  description: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
};

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// The Stripe side of the books — read-only money in/out. Empty until Stripe keys
// are set (POS-STARTER-1), then it's live. Owner/bookkeeper gated server-side.
export default function StripeLedger() {
  const [rows, setRows] = useState<Row[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/books/stripe-ledger");
        const d = await r.json();
        if (r.ok) {
          setRows(d.rows || []);
          setConfigured(!!d.configured);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exportCsv = () =>
    downloadCsv(
      `lumenati-stripe-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        ["Date", "Type", "Description", "Amount", "Fee", "Net"],
        rows.map((r) => [
          r.date,
          r.type,
          r.description,
          (r.amountCents / 100).toFixed(2),
          (r.feeCents / 100).toFixed(2),
          (r.netCents / 100).toFixed(2),
        ]),
      ),
    );

  if (loading) return null;

  return (
    <>
      <SectionTitle
        action={
          rows.length ? (
            <button
              onClick={exportCsv}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-black/60 hover:bg-black/4"
            >
              Export CSV
            </button>
          ) : undefined
        }
      >
        Stripe ledger
      </SectionTitle>
      <Card>
        {!configured ? (
          <div className="px-4 py-8 text-center text-sm text-black/40">
            Connect Stripe (add your keys) to pull real charges, fees, refunds, and payouts here.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-black/40">No Stripe activity yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/45">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Net</th>
                <th className="px-4 py-2 font-medium">Fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 tnum text-black/60">{r.date}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral">{r.type.replace(/_/g, " ")}</Badge>
                    {r.description && <span className="ml-2 text-xs text-black/40">{r.description}</span>}
                  </td>
                  <td className={`px-4 py-2.5 tnum font-medium ${r.netCents < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {usd(r.netCents)}
                  </td>
                  <td className="px-4 py-2.5 tnum text-black/45">{r.feeCents ? usd(r.feeCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
