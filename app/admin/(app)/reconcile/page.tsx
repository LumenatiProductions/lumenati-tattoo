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
  recent?: {
    id: string;
    at: string;
    kind: string;
    status: string;
    amountCents: number;
    artist: string;
    client: string;
    refundable: boolean;
  }[];
};

const KIND_LABEL: Record<string, string> = {
  ticket: "Ticket",
  deposit: "Deposit",
  other: "Charge",
};

export default function ReconcilePage() {
  const { realRole } = useRole();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundErr, setRefundErr] = useState<string | null>(null);

  // Refund a card payment through the engine (reverses split transfers, fixes
  // the books + ledger server-side). Idempotent, so a double click is safe.
  const refund = async (p: NonNullable<Data["recent"]>[number]) => {
    const who = p.client || p.artist || "this payment";
    if (!window.confirm(`Refund ${fmtPrecise(p.amountCents)} to ${who}? The money goes back to their card.`)) return;
    setRefunding(p.id);
    setRefundErr(null);
    try {
      const r = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: p.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRefundErr(d.error || "Refund failed.");
      } else {
        setData((prev) =>
          prev
            ? {
                ...prev,
                recent: (prev.recent ?? []).map((x) =>
                  x.id === p.id ? { ...x, status: "refunded", refundable: false } : x,
                ),
              }
            : prev,
        );
      }
    } catch {
      setRefundErr("Refund failed — check the connection and try again.");
    } finally {
      setRefunding(null);
    }
  };

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

  if (!["owner"].includes(realRole)) {
    return <p className="text-sm text-white/65">Admins only.</p>;
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
        <p className="text-sm text-white/65">
          Stripe&apos;s ledger against our records{monthLabel ? ` — ${monthLabel}` : ""}. When both
          sides agree, the books are square.
        </p>
      </div>

      {error && (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-white/65">{error}</div>
        </Card>
      )}
      {!error && !data && (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-white/55">Pulling both ledgers…</div>
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
                  <div className="px-4 py-8 text-center text-sm text-white/55">
                    Stripe isn&apos;t connected yet.
                  </div>
                ) : data.stripe.error ? (
                  <div className="px-4 py-8 text-center text-sm text-rose-400">{data.stripe.error}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 divide-x divide-white/8 border-b border-white/8">
                      <Cell label="Available" value={fmtPrecise(data.stripe.availableCents ?? 0)} />
                      <Cell label="Pending" value={fmtPrecise(data.stripe.pendingCents ?? 0)} />
                    </div>
                    <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-white/55">
                      Recent payouts to the bank
                    </div>
                    <div className="divide-y divide-white/8">
                      {(data.stripe.payouts ?? []).length === 0 && (
                        <div className="px-4 py-4 text-center text-sm text-white/55">No payouts yet.</div>
                      )}
                      {(data.stripe.payouts ?? []).map((p) => (
                        <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                          <span className="text-white/70">{p.date}</span>
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
                <div className="grid grid-cols-2 divide-x divide-white/8 border-b border-white/8">
                  <Cell label="Card sales (recorded)" value={fmtPrecise(data.square.cardCents)} />
                  <Cell label="Cash sales (Square)" value={fmtPrecise(data.square.cashCents)} />
                </div>
                <div className="grid grid-cols-2 divide-x divide-white/8 border-b border-white/8">
                  <Cell label="Cash logged" value={fmtPrecise(data.cash.loggedCents)} />
                  <Cell
                    label="Cash unreconciled"
                    value={fmtPrecise(data.cash.unreconciledCents)}
                    warn={data.cash.unreconciledCents > 0}
                  />
                </div>
                <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-white/55">
                  Drawer closes
                </div>
                <div className="px-4 pb-3">
                  {data.cash.sessions.length === 0 ? (
                    <div className="py-2 text-sm text-white/55">No closed drawers yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                      {data.cash.sessions.map((s, i) => (
                        <span key={i} className="text-white/65">
                          {new Date(s.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}:{" "}
                          {s.overShortCents === 0 ? (
                            <span className="text-emerald-400">even</span>
                          ) : (
                            <span className={(s.overShortCents ?? 0) > 0 ? "text-emerald-400" : "text-rose-400"}>
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

              {/* Individual card payments, with the refund action. */}
              <div className="mt-5">
                <SectionTitle>Card payments this month</SectionTitle>
                <Card>
                  {(data.recent ?? []).length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-white/55">
                      No card payments yet this month.
                    </div>
                  ) : (
                    <div className="divide-y divide-white/8">
                      {(data.recent ?? []).map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">
                              {p.client || p.artist || KIND_LABEL[p.kind] || "Payment"}
                              <span className="ml-2 text-xs font-normal text-white/55">
                                {KIND_LABEL[p.kind] ?? p.kind}
                                {p.artist && p.client ? ` · ${p.artist}` : ""}
                              </span>
                            </div>
                            <div className="text-xs text-white/60">
                              {new Date(p.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {" · "}
                              {new Date(p.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="tnum font-semibold">{fmtPrecise(p.amountCents)}</span>
                            {p.status === "refunded" ? (
                              <Badge tone="neutral">refunded</Badge>
                            ) : p.refundable ? (
                              <button
                                onClick={() => refund(p)}
                                disabled={refunding === p.id}
                                className="rounded-md border border-white/12 px-2.5 py-1 text-xs font-medium text-white/70 hover:border-white/30 hover:text-ink disabled:opacity-40"
                              >
                                {refunding === p.id ? "Refunding…" : "Refund"}
                              </button>
                            ) : (
                              <Badge tone={p.status === "paid" ? "good" : "neutral"}>{p.status}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                {refundErr && (
                  <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
                    {refundErr}
                  </div>
                )}
              </div>

              {data.recorded.pendingCount > 0 && (
                <div className="mt-3 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
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
      <div className="text-xs font-medium uppercase tracking-wide text-white/60">{label}</div>
      <div className={`tnum mt-1 text-xl font-semibold ${warn ? "text-amber-400" : "text-ink"}`}>{value}</div>
    </div>
  );
}
