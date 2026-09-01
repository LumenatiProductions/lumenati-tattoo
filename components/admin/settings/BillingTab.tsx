"use client";

import { TabHeader } from "@/components/admin/tabs";

import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { Card } from "@/components/admin/ui";

// Billing — the shop's Lumenati membership (owner-only). Three plans:
// Artist $99 (solo chair), Shop $199 + $79/seat, Founding 100 $49/seat locked
// for life. A 30-day free month runs before any card is asked for; when it
// lapses the shell locks every page but this one. Checkout + card management
// are Stripe-hosted — no card numbers ever touch our pages.

type BillingState = {
  configured: boolean;
  exempt: boolean;
  open: boolean;
  plan: string | null;
  status: string | null;
  seats: number;
  billedSeats: number | null;
  periodEnd: string | null;
  trialDaysLeft: number | null;
  foundingLeft: number;
  hasSubscription: boolean;
};

const fmtUsd = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

const STATUS_LABELS: Record<string, string> = {
  trial: "Free month",
  trialing: "Free month",
  active: "Active",
  past_due: "Card problem, retrying",
  canceled: "Canceled",
  unpaid: "Lapsed",
  incomplete: "Payment incomplete",
  incomplete_expired: "Payment expired",
};

export default function BillingPage() {
  const { realRole } = useRole();
  const [state, setState] = useState<BillingState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/billing");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load billing");
      setState(j as BillingState);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load billing");
    }
  }, []);

  useEffect(() => {
    load();
    // Back from a successful checkout: the webhook usually lands within a few
    // seconds — poll briefly so the page flips to Active without a manual
    // refresh.
    const params = new URLSearchParams(window.location.search);
    if (params.get("sub") === "success") {
      setJustPaid(true);
      const t1 = setTimeout(load, 2500);
      const t2 = setTimeout(load, 7000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [load]);

  const act = async (body: { action: string; plan?: string }) => {
    setBusy(body.plan ?? body.action);
    setErr(null);
    try {
      const r = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      window.location.href = j.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  };

  if (realRole !== "owner") {
    return (
      <Card className="max-w-md p-6 text-sm text-white/70">Admins only.</Card>
    );
  }

  if (!state) {
    return <div className="text-sm text-white/60">{err ?? "Loading billing…"}</div>;
  }

  const subscribed = state.hasSubscription && state.status !== "canceled";
  const showPlans = !state.exempt && !subscribed;
  const solo = state.seats === 1;
  const shopMonthly = 19900 + state.seats * 7900;
  const foundingMonthly = state.seats * 4900;
  const foundingAvailable = state.foundingLeft >= state.seats;

  return (
    <div className="max-w-3xl">
      <TabHeader title="Billing" subtitle="Your Lumenati membership." />

      {justPaid && (
        <Card className="mb-4 border-emerald-400/30 p-4 text-sm text-emerald-300">
          Payment confirmed. Welcome aboard. {state.status !== "active" && "Finalizing with Stripe…"}
        </Card>
      )}
      {err && <Card className="mb-4 border-red-400/30 p-4 text-sm text-red-300">{err}</Card>}

      {/* Where things stand */}
      <Card className="p-5">
        {state.exempt ? (
          <div className="text-sm text-white/75">This shop is on the house. Nothing to pay here, ever.</div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-white">
                {STATUS_LABELS[state.status ?? ""] ?? "No membership yet"}
              </div>
              <div className="mt-1 text-sm text-white/65">
                {state.status === "trial" && state.trialDaysLeft != null
                  ? state.trialDaysLeft > 0
                    ? `${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? "" : "s"} left on your free month. Pick a plan below whenever you're ready.`
                    : "Your free month has ended. Pick a plan below and everything comes right back."
                  : subscribed
                    ? `${state.plan === "founding" ? "Founding 100" : state.plan === "shop" ? "Shop plan" : "Artist plan"} · ${
                        state.billedSeats ?? state.seats
                      } seat${(state.billedSeats ?? state.seats) === 1 ? "" : "s"}${
                        state.periodEnd ? ` · renews ${new Date(state.periodEnd).toLocaleDateString()}` : ""
                      }`
                    : "Pick a plan below to keep the shop running."}
              </div>
            </div>
            {state.configured && state.hasSubscription && (
              <button
                onClick={() => act({ action: "portal" })}
                disabled={busy !== null}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/85 hover:bg-white/6 disabled:opacity-50"
              >
                {busy === "portal" ? "Opening…" : "Manage billing"}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Plans */}
      {showPlans && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {/* Founding 100 — the deal, leads. */}
            {foundingAvailable && (
              <Card className="border-brand/40 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-white">Founding 100</div>
                  <span className="rounded bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                    {state.foundingLeft} of 100 seats left
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  $49<span className="text-sm font-normal text-white/60">/artist/mo</span>
                </div>
                <p className="mt-2 text-sm text-white/65">
                  Locked for life. Your price never goes up, no matter what the list price does.
                  {!solo && ` For your ${state.seats} artists: ${fmtUsd(foundingMonthly)}/mo.`}
                </p>
                <button
                  onClick={() => act({ action: "checkout", plan: "founding" })}
                  disabled={busy !== null}
                  className="mt-4 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "founding" ? "Heading to checkout…" : "Claim founding seats"}
                </button>
              </Card>
            )}

            {/* The standard plan that fits the roster. */}
            <Card className="p-5">
              <div className="text-base font-semibold text-white">{solo ? "Artist" : "Shop"}</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {solo ? "$99" : fmtUsd(shopMonthly)}
                <span className="text-sm font-normal text-white/60">/mo</span>
              </div>
              <p className="mt-2 text-sm text-white/65">
                {solo
                  ? "One chair, the whole toolkit: your books, goals, follow-ups, payments."
                  : `$199 base + $79 per artist. Covers your ${state.seats} artists today; the price follows your roster automatically.`}
              </p>
              <button
                onClick={() => act({ action: "checkout", plan: solo ? "artist" : "shop" })}
                disabled={busy !== null}
                className="mt-4 w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/6 disabled:opacity-50"
              >
                {busy === (solo ? "artist" : "shop") ? "Heading to checkout…" : `Choose ${solo ? "Artist" : "Shop"}`}
              </button>
            </Card>
          </div>
          <p className="mt-4 text-xs text-white/50">
            Checkout and card details are handled by Stripe. Cancel anytime, your data stays put.
          </p>
        </>
      )}
    </div>
  );
}
