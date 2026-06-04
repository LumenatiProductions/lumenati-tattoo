"use client";

import { useRole } from "@/lib/admin/role-context";
import { useSales } from "@/lib/admin/sales-context";
import { ARTISTS, RENT_CHARGES } from "@/lib/admin/mock-data";
import { statementFor, fmt, type ArtistStatement } from "@/lib/admin/calc";
import { Card, SectionTitle, Dot, MockBanner, StatCard } from "@/components/admin/ui";

export default function PayoutsPage() {
  const { role, asArtistId } = useRole();
  const { sales, real } = useSales();

  const all = ARTISTS.map((a) => statementFor(a, sales, RENT_CHARGES));
  const visible =
    role === "artist" ? all.filter((s) => s.artist.id === asArtistId) : all;

  const pays = visible.filter((s) => s.net > 0).sort((a, b) => b.net - a.net);
  const collects = visible.filter((s) => s.net < 0).sort((a, b) => a.net - b.net);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Payouts &amp; Settlement</h1>
        <p className="text-sm text-black/50">
          Card money the shop holds, minus the shop&apos;s cut on cash and rent. The net
          is who writes whom a check.
        </p>
      </div>
      {!real && <MockBanner source="Square" />}

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
          <StatCard label="Artists to settle" value={String(visible.length)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle>Shop pays out</SectionTitle>
          <Card>
            <div className="divide-y divide-black/5">
              {pays.length === 0 && <Empty>Nobody to pay right now.</Empty>}
              {pays.map((s) => (
                <SettleRow key={s.artist.id} st={s} kind="pay" />
              ))}
            </div>
          </Card>
        </div>
        <div>
          <SectionTitle>Shop collects</SectionTitle>
          <Card>
            <div className="divide-y divide-black/5">
              {collects.length === 0 && <Empty>Nothing to collect.</Empty>}
              {collects.map((s) => (
                <SettleRow key={s.artist.id} st={s} kind="collect" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SettleRow({ st, kind }: { st: ArtistStatement; kind: "pay" | "collect" }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Dot color={st.artist.color} />
        <div>
          <div className="text-sm font-medium">{st.artist.name}</div>
          <div className="text-xs text-black/45">
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
            kind === "pay" ? "text-amber-600" : "text-emerald-600"
          }`}
        >
          {fmt(Math.abs(st.net))}
        </span>
        <button
          className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-black/55 hover:bg-black/4"
          title="Recording payouts lands with Square + QuickBooks"
        >
          Mark settled
        </button>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-black/40">{children}</div>;
}
