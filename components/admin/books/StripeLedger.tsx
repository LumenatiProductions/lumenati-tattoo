"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import { toCsv, downloadCsv } from "@/lib/books/export";
import { todayLocal } from "@/lib/dates";

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
// are set (POS-STARTER-1), then it's live. Admin gated server-side.
export default function StripeLedger() {
  const [rows, setRows] = useState<Row[]>([]);
  const [configured, setConfigured] = useState(true);
  const [linked, setLinked] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/books/stripe-ledger");
        const d = await r.json();
        if (r.ok) {
          setRows(d.rows || []);
          setConfigured(!!d.configured);
          setLinked(!!d.linked);
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
      `lumenati-stripe-ledger-${todayLocal()}.csv`,
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
              className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/6"
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
          <div className="px-4 py-8 text-center text-sm text-white/55">
            Connect Stripe (add your keys) to pull real charges, fees, refunds, and payouts here.
          </div>
        ) : !linked ? (
          <div className="px-4 py-8 text-center text-sm text-white/55">
            Link the shop&apos;s Stripe account on the Pay page and its charges, fees, refunds, and payouts land here.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-white/55">No Stripe activity yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/60">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Net</th>
                <th className="px-4 py-2 font-medium">Fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/8 last:border-0">
                  <td className="px-4 py-2.5 tnum text-white/75">{r.date}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral">{r.type.replace(/_/g, " ")}</Badge>
                    {r.description && <span className="ml-2 text-xs text-white/55">{r.description}</span>}
                  </td>
                  <td className={`px-4 py-2.5 tnum font-medium ${r.netCents < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {usd(r.netCents)}
                  </td>
                  <td className="px-4 py-2.5 tnum text-white/60">{r.feeCents ? usd(r.feeCents) : "·"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
