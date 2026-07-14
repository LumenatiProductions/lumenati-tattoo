"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Dot } from "@/components/admin/ui";

type Eligible = {
  paymentId: string;
  artistName: string;
  amountCents: number;
  feeCents: number;
  paidAt: string | null;
};

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// Owner-only: get-paid-early (instant payout). A booth renter's settled ticket
// normally reaches their bank on Stripe's schedule; this sends it to their debit
// card now, minus Lumenati's speed fee. Renter-only — payroll artists are paid
// by Gusto, so this list is empty for them by construction.
export default function GetPaidEarly() {
  const [rows, setRows] = useState<Eligible[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/payments/instant-payout");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setRows(d.eligible || []);
    } catch {
      /* leave the section empty on a load error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const payNow = async (row: Eligible) => {
    const net = row.amountCents - row.feeCents;
    if (
      !window.confirm(
        `Send ${usd(net)} to ${row.artistName}'s debit card now? Lumenati's ${usd(
          row.feeCents,
        )} early-payout fee comes out of this ticket.`,
      )
    )
      return;
    setBusyId(row.paymentId);
    setMsg(null);
    try {
      const r = await fetch("/api/payments/instant-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: row.paymentId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg(`${usd(d.payoutCents ?? net)} on the way to ${row.artistName}.`);
        setRows((cur) => cur.filter((x) => x.paymentId !== row.paymentId));
      } else {
        setMsg(d.error || "Could not pay out early.");
      }
    } catch {
      setMsg("Could not pay out early.");
    }
    setBusyId(null);
  };

  if (loading || rows.length === 0) return null;

  return (
    <div className="mb-6">
      <SectionTitle>Get paid early</SectionTitle>
      <Card>
        <div className="border-b border-white/8 px-4 py-3 text-xs text-white/65">
          Send a renter&apos;s settled card sale to their debit card right now instead of waiting
          for the bank. A small speed fee comes out of that ticket.
        </div>
        {msg && <div className="px-4 py-2 text-xs text-white/75">{msg}</div>}
        <div className="divide-y divide-white/8">
          {rows.map((row) => (
            <div key={row.paymentId} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Dot color="#22c55e" />
                <div>
                  <div className="text-sm font-medium">{row.artistName}</div>
                  <div className="text-xs text-white/60">
                    {usd(row.amountCents)} sale · {usd(row.feeCents)} fee ·{" "}
                    <span className="text-emerald-300">{usd(row.amountCents - row.feeCents)} now</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => payNow(row)}
                disabled={busyId === row.paymentId}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {busyId === row.paymentId ? "Sending…" : "Get paid now"}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
