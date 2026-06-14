"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { fmtPrecise } from "@/lib/admin/calc";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";

// Reconciliation: Stripe's view of the money next to our own records (payments,
// Square sales mirror, cash log + drawer) for the current month. The point is
// the DIFF — when the two sides agree, the books are square without QuickBooks.

type Data = {
  month: string;
  stripe: {
    configured: boolean;
    availableCents?: number;
    pendingCents?: number;
    chargesCents?: number;
    feesCents?: number;
    payouts?: { id: string; date: string; amountCents: number; status: string }[];
    error?: string;
  };
  recorded: { paidCount: number; paidCents: number; pendingCount: number };
  square: { count: number; cardCents: number; cashCents: number };
  cash: {
    loggedCents: number;
    unreconciledCents: number;
    sessions: { openedAt: string; overShortCents: number | null }[];
  };
};

export default function ReconcilePage() {
  const { realRole } = useRole();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/reconcile");
        const d = await r.json().catch(() => ({}));
        if (r.ok) setData(d);
        else setError(d.error || "Could not load reconciliation.");
      } catch {
        setError("Could not load reconciliation.");
      }
    })();
  }, []);

  if (!["owner", "bookkeeper"].includes(realRole)) {
    return <p className="text-sm text-black/50">Owners &amp; bookkeepers only.</p>;
  }

  const monthLabel = data
    ? new Date(`${data.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  // The headline diff: what Stripe says it charged this month vs what our
  // payments rows say got paid. Zero (or pennies) = square.
  const diff =
    data?.stripe.configured && data.stripe.chargesCents !== undefined
      ? data.stripe.chargesCents - data.recorded.paidCents
      : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reconciliation</h1>
        <p className="text-sm text-black/50">
          Stripe&apos;s ledger against our records{monthLabel ? ` — ${monthLabel}` : ""}. When both
          sides agree, the books are square.
        </p>
      </div>

      {error && (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/50">{error}</div>
        </Card>
      )}
      {!error && !data && (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">Pulling both ledgers…</div>
        </Card>
      )}

      {data && (
        <>
          {/* Headline: do the two sides agree? */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Stripe charged"
              value={data.stripe.chargesCents !== undefined ? fmtPrecise(data.stripe.chargesCents) : "—"}
              sub="per Stripe, this month"
            />
            <StatCard
              label="We recorded"
              value={fmtPrecise(data.recorded.paidCents)}
              sub={`${data.recorded.paidCount} paid payment${data.recorded.paidCount === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Difference"
              value={diff !== null ? fmtPrecise(Math.abs(diff)) : "—"}
              tone={diff === null ? "neutral" : Math.abs(diff) < 100 ? "good" : "warn"}
              sub={diff === null ? "Stripe not connected" : Math.abs(diff) < 100 ? "square" : diff > 0 ? "Stripe has more" : "we have more"}
              accent={diff !== null && Math.abs(diff) >= 100}
            />
            <StatCard
              label="Stripe fees"
              value={data.stripe.feesCents !== undefined ? fmtPrecise(data.stripe.feesCents) : "—"}
              sub="this month"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Stripe side */}
            <div>
              <SectionTitle>Stripe</SectionTitle>
              <Card>
                {!data.stripe.configured ? (
                  <div className="px-4 py-8 text-center text-sm text-black/40">
                    Stripe isn&apos;t connected yet.
                  </div>
                ) : data.stripe.error ? (
                  <div className="px-4 py-8 text-center text-sm text-rose-600">{data.stripe.error}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 divide-x divide-black/5 border-b border-black/5">
                      <Cell label="Available" value={fmtPrecise(data.stripe.availableCents ?? 0)} />
                      <Cell label="Pending" value={fmtPrecise(data.stripe.pendingCents ?? 0)} />
                    </div>
                    <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-black/40">
                      Recent payouts to the bank
                    </div>
                    <div className="divide-y divide-black/5">
                      {(data.stripe.payouts ?? []).length === 0 && (
                        <div className="px-4 py-4 text-center text-sm text-black/40">No payouts yet.</div>
                      )}
                      {(data.stripe.payouts ?? []).map((p) => (
                        <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                          <span className="text-black/55">{p.date}</span>
                          <span className="flex items-center gap-2">
                            <span className="tnum font-medium">{fmtPrecise(p.amountCents)}</span>
                            <Badge tone={p.status === "paid" ? "good" : "neutral"}>{p.status}</Badge>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </div>

            {/* Our side */}
            <div>
              <SectionTitle>Our records</SectionTitle>
              <Card>
                <div className="grid grid-cols-2 divide-x divide-black/5 border-b border-black/5">
                  <Cell label="Card sales (recorded)" value={fmtPrecise(data.square.cardCents)} />
                  <Cell label="Cash sales (Square)" value={fmtPrecise(data.square.cashCents)} />
                </div>
                <div className="grid grid-cols-2 divide-x divide-black/5 border-b border-black/5">
                  <Cell label="Cash logged" value={fmtPrecise(data.cash.loggedCents)} />
                  <Cell
                    label="Cash unreconciled"
                    value={fmtPrecise(data.cash.unreconciledCents)}
                    warn={data.cash.unreconciledCents > 0}
                  />
                </div>
                <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-black/40">
                  Drawer closes
                </div>
                <div className="px-4 pb-3">
                  {data.cash.sessions.length === 0 ? (
                    <div className="py-2 text-sm text-black/40">No closed drawers yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                      {data.cash.sessions.map((s, i) => (
                        <span key={i} className="text-black/50">
                          {new Date(s.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}:{" "}
                          {s.overShortCents === 0 ? (
                            <span className="text-emerald-600">even</span>
                          ) : (
                            <span className={(s.overShortCents ?? 0) > 0 ? "text-emerald-600" : "text-rose-600"}>
                              {(s.overShortCents ?? 0) > 0 ? "+" : "−"}
                              {fmtPrecise(Math.abs(s.overShortCents ?? 0))}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {data.recorded.pendingCount > 0 && (
                <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {data.recorded.pendingCount} payment link{data.recorded.pendingCount === 1 ? "" : "s"} still
                  pending — unpaid links are normal, but stale ones are worth voiding.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-black/45">{label}</div>
      <div className={`tnum mt-1 text-xl font-semibold ${warn ? "text-amber-600" : "text-ink"}`}>{value}</div>
    </div>
  );
}
