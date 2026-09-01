"use client";

import { TabHeader } from "@/components/admin/money/shared";

import { useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { useSales } from "@/lib/admin/sales-context";
import { useSettledStatements } from "@/lib/admin/settlements-context";
import { fmt, type ArtistStatement } from "@/lib/admin/calc";
import { Card, SectionTitle, StatRow, Dot, MockBanner, StatCard } from "@/components/admin/ui";
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
  // Split CONTRACTORS are paid directly by the shop (1099 at $600+), so they get
  // their own list — filing them under Gusto payroll would be the wrong treatment.
  const contractors = visible
    .filter((s) => s.artist.pay.type === "contractor_split" && s.contractorOwed > 0)
    .sort((a, b) => b.contractorOwed - a.contractorOwed);

  const settle = async (st: ArtistStatement) => {
    const isRenter = st.artist.pay.type === "booth_rent";
    const isContractor = st.artist.pay.type === "contractor_split";
    setMsg(null);
    const r = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artistId: st.artist.id,
        amountCents: st.net,
        note: isRenter
          ? `pass-through · card ${fmt(st.cardService)} svc + ${fmt(st.cardTips)} tips`
          : isContractor
            ? `contractor paid · ${fmt(st.artistEarnings)} (${fmt(st.grossService)} svc, shop cut ${fmt(st.shopCut)}, tips ${fmt(st.grossTips)}) · 1099 basis`
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
        ? `${st.artist.name}'s sales passed through, clean through today.`
        : isContractor
          ? `${st.artist.name} paid through today. It counts toward their 1099.`
          : `${st.artist.name} entered into Gusto through today.`) +
        (d.receipt?.sent ? " Receipt emailed." : ""),
    );
    await refreshSettlements();
    return true;
  };

  return (
    <div>
      <TabHeader
        title="Pay"
        subtitle="Renters' card money the shop is holding (theirs, 100%), and the wage numbers to type into Gusto each payroll. Rent is billed separately, never taken out of anyone's sales."
      />
      {!real && !loading && <MockBanner source="Square" />}

      {/* Stripe Connect — owner only. Onboarded renters get their card sales
          sent straight to their bank; the manual list below covers the rest. */}
      {role === "owner" && <PayoutsConnect />}

      {/* Get-paid-early: instant payout of a renter's settled card sale. Only
          renders when there's an eligible ticket, so it's invisible otherwise. */}
      {role === "owner" && <GetPaidEarly />}

      {role !== "artist" && (
        <StatRow cols={3}>
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
        </StatRow>
      )}

      {role !== "artist" && !settleConfigured && (
        <div className="mb-4 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          <span className="font-semibold">Settlement history isn&apos;t on yet.</span> Clearing a
          payout here won&apos;t be saved until it&apos;s turned on.
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
            Card sales collected on the shop&apos;s reader for booth renters. The shop holds it,
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

          {contractors.length > 0 && (
            <div className="mt-5">
              <SectionTitle>Contractors to pay</SectionTitle>
              <Card>
                <div className="divide-y divide-white/8">
                  {contractors.map((s) => (
                    <SettleRow
                      key={s.artist.id}
                      st={s}
                      kind="contractor"
                      canSettle={role !== "artist" && settleConfigured}
                      onSettle={settle}
                    />
                  ))}
                </div>
              </Card>
              <p className="mt-2 px-1 text-xs text-white/55">
                You collected the client&apos;s money and keep your cut, so this is their share to
                pay out directly. No withholding. It counts toward their 1099 once they clear $600
                for the year.
              </p>
            </div>
          )}
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
  kind: "passthrough" | "payroll" | "contractor";
  canSettle: boolean;
  onSettle: (st: ArtistStatement) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  const click = async () => {
    const q =
      kind === "passthrough"
        ? `Record that ${fmt(st.passThroughOwed)} was handed over to ${st.artist.name} and clear their sales through today?`
        : kind === "contractor"
          ? `Record that you paid ${st.artist.name} ${fmt(st.contractorOwed)} and clear their sales through today? It counts toward their 1099.`
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
            kind === "passthrough" ? "text-amber-400" : kind === "contractor" ? "text-emerald-300" : "text-sky-300"
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
                : kind === "contractor"
                  ? "Record the payment and reset this row"
                  : "Record the Gusto entry and reset this row"
            }
          >
            {busy
              ? "Saving…"
              : kind === "passthrough"
                ? "Mark passed through"
                : kind === "contractor"
                  ? "Mark paid"
                  : "Mark entered"}
          </button>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-white/55">{children}</div>;
}
