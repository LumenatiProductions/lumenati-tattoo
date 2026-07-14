"use client";

import { useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { useSales } from "@/lib/admin/sales-context";
import { useSettledStatements } from "@/lib/admin/settlements-context";
import { fmt, type ArtistStatement } from "@/lib/admin/calc";
import { Card, SectionTitle, Dot, MockBanner, StatCard } from "@/components/admin/ui";
import PayoutsConnect from "@/components/admin/connect/PayoutsConnect";
import GetPaidEarly from "@/components/admin/connect/GetPaidEarly";

// Pay (2026-07-08 rebuild). The shop cuts no checks and withholds nothing.
// Two jobs live here:
//   1. Renter pass-through — card sales collected on the shop's reader for
//      booth renters. 100% theirs; "Mark passed through" records the hand-off.
//      Rent is billed on its own (see /admin/rent) and never netted here.
//   2. Gusto payroll prep — split artists' wages (their share of service + all
//      tips) to type into Gusto each pay period; "Mark entered" clears the row.
// The salaried owner never appears. Statements count sales AFTER each artist's
// settled_through (useSettledStatements — shared with the role homes).

export default function PayoutsPage() {
  const { role, asArtistId } = useRole();
  const { real, loading } = useSales();
  const {
    statements: all,
    configured: settleConfigured,
    refresh: refreshSettlements,
  } = useSettledStatements();

  const [msg, setMsg] = useState<string | null>(null);

  const visible = role === "artist" ? all.filter((s) => s.artist.id === asArtistId) : all;

  const renters = visible
    .filter((s) => s.artist.pay.type === "booth_rent" && s.passThroughOwed > 0)
    .sort((a, b) => b.passThroughOwed - a.passThroughOwed);
  const payroll = visible
    .filter((s) => s.artist.pay.type === "payroll_split" && s.gustoWages > 0)
    .sort((a, b) => b.gustoWages - a.gustoWages);

  const settle = async (st: ArtistStatement) => {
    const isRenter = st.artist.pay.type === "booth_rent";
    setMsg(null);
    const r = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artistId: st.artist.id,
        amountCents: st.net,
        note: isRenter
          ? `pass-through · card ${fmt(st.cardService)} svc + ${fmt(st.cardTips)} tips`
          : `Gusto entry · ${fmt(st.artistEarnings)} wages (${fmt(st.grossService)} svc, shop cut ${fmt(st.shopCut)}, tips ${fmt(st.grossTips)})`,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(d.error || "Could not record that.");
      return false;
    }
    setMsg(
      (isRenter
        ? `${st.artist.name}'s sales passed through — clean through today.`
        : `${st.artist.name} entered into Gusto through today.`) +
        (d.receipt?.sent ? " Receipt emailed." : ""),
    );
    await refreshSettlements();
    return true;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pay</h1>
        <p className="text-sm text-white/65">
          Renters&apos; card money the shop is holding (theirs, 100%), and the wage numbers to
          type into Gusto each payroll. Rent is billed separately — never taken out of anyone&apos;s
          sales.
        </p>
      </div>
      {!real && !loading && <MockBanner source="Square" />}

      {/* Stripe Connect — owner only. Onboarded renters get their card sales
          sent straight to their bank; the manual list below covers the rest. */}
      {role === "owner" && <PayoutsConnect />}

      {/* Get-paid-early: instant payout of a renter's settled card sale. Only
          renders when there's an eligible ticket, so it's invisible otherwise. */}
      {role === "owner" && <GetPaidEarly />}

      {role !== "artist" && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="Holding for renters"
            value={fmt(renters.reduce((a, s) => a + s.passThroughOwed, 0))}
            sub="their card sales, passed through 100%"
            tone="warn"
            accent
          />
          <StatCard
            label="Gusto wages to enter"
            value={fmt(payroll.reduce((a, s) => a + s.gustoWages, 0))}
            sub="split artists, this pay period"
          />
          <StatCard label="Rows to clear" value={String(renters.length + payroll.length)} />
        </div>
      )}

      {role !== "artist" && !settleConfigured && (
        <div className="mb-4 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          <span className="font-semibold">Settlement history is off</span> — run{" "}
          <code className="font-mono">supabase/settlements-schema.sql</code> in Supabase to make
          clearing a row stick.
        </div>
      )}
      {msg && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/75 shadow-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle>Renter pass-through</SectionTitle>
          <Card>
            <div className="divide-y divide-white/8">
              {renters.length === 0 && <Empty>Not holding anything for renters.</Empty>}
              {renters.map((s) => (
                <SettleRow
                  key={s.artist.id}
                  st={s}
                  kind="passthrough"
                  canSettle={role !== "artist" && settleConfigured}
                  onSettle={settle}
                />
              ))}
            </div>
          </Card>
          <p className="mt-2 px-1 text-xs text-white/55">
            Card sales collected on the shop&apos;s reader for booth renters — the shop holds it,
            then hands over all of it. Rent lives on its own invoice.
          </p>
        </div>
        <div>
          <SectionTitle>Gusto payroll prep</SectionTitle>
          <Card>
            <div className="divide-y divide-white/8">
              {payroll.length === 0 && <Empty>Nothing new for payroll.</Empty>}
              {payroll.map((s) => (
                <SettleRow
                  key={s.artist.id}
                  st={s}
                  kind="payroll"
                  canSettle={role !== "artist" && settleConfigured}
                  onSettle={settle}
                />
              ))}
            </div>
          </Card>
          <p className="mt-2 px-1 text-xs text-white/55">
            The wages number is the artist&apos;s share of service plus all tips. Type it into
            Gusto, run payroll there, then mark it entered.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettleRow({
  st,
  kind,
  canSettle,
  onSettle,
}: {
  st: ArtistStatement;
  kind: "passthrough" | "payroll";
  canSettle: boolean;
  onSettle: (st: ArtistStatement) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  const click = async () => {
    const q =
      kind === "passthrough"
        ? `Record that ${fmt(st.passThroughOwed)} was handed over to ${st.artist.name} and clear their sales through today?`
        : `Record that ${st.artist.name}'s ${fmt(st.gustoWages)} in wages was entered into Gusto through today?`;
    if (!window.confirm(q)) return;
    setBusy(true);
    await onSettle(st);
    setBusy(false);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Dot color={st.artist.color} />
        <div>
          <div className="text-sm font-medium">{st.artist.name}</div>
          <div className="text-xs text-white/60">
            {kind === "passthrough"
              ? `card ${fmt(st.cardService)} svc + ${fmt(st.cardTips)} tips`
              : `${fmt(st.grossService)} svc · shop cut ${fmt(st.shopCut)} · tips ${fmt(st.grossTips)}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`tnum text-sm font-semibold ${
            kind === "passthrough" ? "text-amber-400" : "text-sky-300"
          }`}
        >
          {fmt(st.net)}
        </span>
        {canSettle && (
          <button
            onClick={click}
            disabled={busy}
            className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/70 hover:bg-white/6 disabled:opacity-40"
            title={
              kind === "passthrough"
                ? "Record the hand-off and reset this row"
                : "Record the Gusto entry and reset this row"
            }
          >
            {busy ? "Saving…" : kind === "passthrough" ? "Mark passed through" : "Mark entered"}
          </button>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-white/55">{children}</div>;
}
