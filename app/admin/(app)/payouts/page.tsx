"use client";

import { useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { useSales } from "@/lib/admin/sales-context";
import { useSettledStatements } from "@/lib/admin/settlements-context";
import { fmt, type ArtistStatement } from "@/lib/admin/calc";
import { Card, SectionTitle, Dot, MockBanner, StatCard } from "@/components/admin/ui";
import PayoutsConnect from "@/components/admin/connect/PayoutsConnect";

// Statements are computed from sales AFTER each artist's latest settlement
// (settled_through), so "Mark settled" really clears the row. The math lives in
// useSettledStatements — shared with the role homes so the numbers agree.

export default function PayoutsPage() {
  const { role, asArtistId } = useRole();
  const { real, loading } = useSales();
  const { statements: all, configured: settleConfigured, refresh: refreshSettlements } = useSettledStatements();

  const [msg, setMsg] = useState<string | null>(null);

  const visible = role === "artist" ? all.filter((s) => s.artist.id === asArtistId) : all;

  const pays = visible.filter((s) => s.net > 0).sort((a, b) => b.net - a.net);
  const collects = visible.filter((s) => s.net < 0).sort((a, b) => a.net - b.net);

  const settle = async (st: ArtistStatement) => {
    setMsg(null);
    const r = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artistId: st.artist.id,
        amountCents: st.net,
        note: `card ${fmt(st.cardService)} svc + ${fmt(st.cardTips)} tips · cash cut ${fmt(
          st.artistOwesShop - st.rentOwed,
        )}${st.rentOwed ? ` · rent ${fmt(st.rentOwed)}` : ""}`,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(d.error || "Could not record that settlement.");
      return false;
    }
    setMsg(
      d.receipt?.sent
        ? `${st.artist.name} settled through today — receipt emailed.`
        : `${st.artist.name} settled through today.${d.receipt?.reason ? ` (No receipt: ${d.receipt.reason.toLowerCase()}.)` : ""}`,
    );
    await refreshSettlements();
    return true;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Payouts &amp; Settlement</h1>
        <p className="text-sm text-white/65">
          Card money the shop holds, minus the shop&apos;s cut on cash and rent. The net
          is who writes whom a check.
        </p>
      </div>
      {!real && !loading && <MockBanner source="Square" />}

      {/* Stripe Connect setup — owner only. Onboarded artists are auto-settled;
          the manual statement view below covers cash + non-onboarded artists. */}
      {role === "owner" && <PayoutsConnect />}

      {role !== "artist" && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="Total to pay artists"
            value={fmt(pays.reduce((a, s) => a + s.net, 0))}
            tone="warn"
            accent
          />
          <StatCard
            label="To collect from artists"
            value={fmt(collects.reduce((a, s) => a - s.net, 0))}
            tone="good"
          />
          <StatCard label="Artists to settle" value={String(pays.length + collects.length)} />
        </div>
      )}

      {role !== "artist" && !settleConfigured && (
        <div className="mb-4 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          <span className="font-semibold">Settlement history is off</span> — run{" "}
          <code className="font-mono">supabase/settlements-schema.sql</code> in Supabase to make
          “Mark settled” stick.
        </div>
      )}
      {msg && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/75 shadow-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle>Shop pays out</SectionTitle>
          <Card>
            <div className="divide-y divide-white/8">
              {pays.length === 0 && <Empty>Nobody to pay right now.</Empty>}
              {pays.map((s) => (
                <SettleRow
                  key={s.artist.id}
                  st={s}
                  kind="pay"
                  canSettle={role !== "artist" && settleConfigured}
                  onSettle={settle}
                />
              ))}
            </div>
          </Card>
        </div>
        <div>
          <SectionTitle>Shop collects</SectionTitle>
          <Card>
            <div className="divide-y divide-white/8">
              {collects.length === 0 && <Empty>Nothing to collect.</Empty>}
              {collects.map((s) => (
                <SettleRow
                  key={s.artist.id}
                  st={s}
                  kind="collect"
                  canSettle={role !== "artist" && settleConfigured}
                  onSettle={settle}
                />
              ))}
            </div>
          </Card>
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
  kind: "pay" | "collect";
  canSettle: boolean;
  onSettle: (st: ArtistStatement) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  const click = async () => {
    const verb = kind === "pay" ? "paid" : "collected";
    if (!window.confirm(`Record that ${fmt(Math.abs(st.net))} was ${verb} and settle ${st.artist.name} through today?`)) {
      return;
    }
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
            {kind === "pay"
              ? `card ${fmt(st.cardService)} svc + ${fmt(st.cardTips)} tips`
              : `cash cut ${fmt(st.artistOwesShop - st.rentOwed)}${
                  st.rentOwed ? ` + rent ${fmt(st.rentOwed)}` : ""
                }`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`tnum text-sm font-semibold ${
            kind === "pay" ? "text-amber-400" : "text-emerald-400"
          }`}
        >
          {fmt(Math.abs(st.net))}
        </span>
        {canSettle && (
          <button
            onClick={click}
            disabled={busy}
            className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/70 hover:bg-white/6 disabled:opacity-40"
            title="Record the check/cash hand-off and reset this statement"
          >
            {busy ? "Settling…" : "Mark settled"}
          </button>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-white/55">{children}</div>;
}
