"use client";

import { useMemo } from "react";
import {
  ReportsProvider,
  useReports,
  type RangePreset,
  type ReportArtist,
} from "@/lib/admin/reports-context";
import { fmt, fmtPrecise } from "@/lib/admin/calc";
import { Card, SectionTitle, StatCard, Badge, Dot } from "@/components/admin/ui";
import Insights from "@/components/admin/Insights";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "year", label: "Full year" },
];

const payLabel = (a: ReportArtist) =>
  a.payType === "rent"
    ? "Booth rent"
    : a.payType === "split"
      ? `${Math.round(a.splitPct * 100)}% split`
      : `Hybrid ${Math.round(a.splitPct * 100)}%`;

const dollars = (cents: number) => (cents / 100).toFixed(2);

// Build a CSV and hand the browser a download. Pure client-side — it only
// serializes numbers already on the page.
function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  return (
    <ReportsProvider>
      <ReportsInner />
    </ReportsProvider>
  );
}

function ReportsInner() {
  const { data, loading, error, preset, year, setPreset, setYear } = useReports();

  const years = useMemo(() => {
    const now = new Date().getUTCFullYear();
    return [now, now - 1, now - 2, now - 3];
  }, []);

  const exportArtists = () => {
    if (!data) return;
    downloadCsv(
      `lumenati-artists-${data.range.from}_to_${data.range.to}.csv`,
      ["Artist", "Pay type", "Tickets", "Gross service", "Tips", "Shop cut", "Net to artist"],
      data.artists.map((a) => [
        a.name,
        payLabel(a),
        a.saleCount,
        dollars(a.grossService),
        dollars(a.grossTips),
        dollars(a.shopCut),
        dollars(a.artistEarnings),
      ]),
    );
  };

  const export1099 = () => {
    if (!data) return;
    downloadCsv(
      `lumenati-1099-${year}.csv`,
      ["Contractor", "Pay arrangement", "Gross earned (service + tips)", "Tickets"],
      data.artists.map((a) => [a.name, payLabel(a), dollars(a.artistEarnings), a.saleCount]),
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-black/50">
            Shop-wide financials, per-artist roll-ups, and 1099 prep. Owner &amp; bookkeeper only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                preset === p.key
                  ? "bg-brand text-white"
                  : "border border-black/10 text-black/60 hover:bg-black/4"
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === "year" && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {data && (
        <div className="mb-5 text-xs text-black/40">
          {data.range.from} → {data.range.to}
          {!data.real && " · no completed tickets in this range yet"}
        </div>
      )}

      {error ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/50">{error}</div>
        </Card>
      ) : loading && !data ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">Crunching the numbers…</div>
        </Card>
      ) : data ? (
        <>
          {/* ── Shop revenue ── */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Gross sales" value={fmt(data.shop.grossSales)} accent />
            <StatCard
              label="Service revenue"
              value={fmt(data.shop.serviceRevenue)}
              sub={`${fmt(data.shop.tips)} tips`}
            />
            <StatCard label="Shop's cut (splits)" value={fmt(data.shop.splitRevenue)} tone="good" />
            <StatCard
              label="Rent collected"
              value={fmt(data.shop.rentCollected)}
              sub={
                data.shop.rentOutstanding
                  ? `${fmt(data.shop.rentOutstanding)} outstanding`
                  : data.rentConfigured
                    ? "all paid"
                    : "Square not linked"
              }
              tone={data.shop.rentOutstanding ? "warn" : "neutral"}
            />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Card total" value={fmt(data.shop.cardTotal)} />
            <StatCard label="Cash total" value={fmt(data.shop.cashTotal)} />
            <StatCard label="To pay artists" value={fmt(data.shop.payoutsOwed)} tone="warn" />
            <StatCard label="To collect" value={fmt(data.shop.collectFromArtists)} tone="good" />
          </div>

          {/* ── Per-artist roll-up ── */}
          <SectionTitle
            action={
              <button
                onClick={exportArtists}
                disabled={!data.artists.length}
                title={data.artists.length ? "Download the per-artist roll-up" : "No tickets in this range"}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-black/60 hover:bg-black/4 disabled:opacity-40"
              >
                Export CSV
              </button>
            }
          >
            Per-artist
          </SectionTitle>
          <Card className="mb-6">
            {data.artists.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-black/40">
                No tickets in this range.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/45">
                    <th className="px-4 py-2 font-medium">Artist</th>
                    <th className="px-4 py-2 font-medium">Tickets</th>
                    <th className="px-4 py-2 font-medium">Gross service</th>
                    <th className="px-4 py-2 font-medium">Tips</th>
                    <th className="px-4 py-2 font-medium">Shop cut</th>
                    <th className="px-4 py-2 font-medium">Net to artist</th>
                  </tr>
                </thead>
                <tbody>
                  {data.artists.map((a) => (
                    <tr key={a.id} className="border-b border-black/5 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Dot color={a.color} />
                          <span className="font-medium">{a.name}</span>
                          <Badge tone="neutral">{payLabel(a)}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 tnum text-black/60">{a.saleCount}</td>
                      <td className="px-4 py-2.5 tnum">{fmt(a.grossService)}</td>
                      <td className="px-4 py-2.5 tnum text-black/60">{fmt(a.grossTips)}</td>
                      <td className="px-4 py-2.5 tnum text-emerald-600">{fmt(a.shopCut)}</td>
                      <td className="px-4 py-2.5 tnum font-medium">{fmt(a.artistEarnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* ── 1099 prep ── */}
          <SectionTitle
            action={
              <button
                onClick={export1099}
                disabled={!data.artists.length}
                title={data.artists.length ? "Download contractor totals for 1099 prep" : "No contractors in this range"}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-black/60 hover:bg-black/4 disabled:opacity-40"
              >
                Export 1099 CSV
              </button>
            }
          >
            1099 prep {preset === "year" ? `· ${year}` : "· select a full year"}
          </SectionTitle>
          <Card className="mb-6 ring-1 ring-brand/20">
            <div className="px-4 py-3 text-xs text-black/50">
              Your artists are independent contractors (booth rent / split / hybrid). Gross earned =
              service kept + all tips for the selected period. Confirm with your accountant exactly
              which figure belongs on the 1099-NEC before filing.
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-black/8 text-left text-xs uppercase tracking-wide text-black/45">
                  <th className="px-4 py-2 font-medium">Contractor</th>
                  <th className="px-4 py-2 font-medium">Arrangement</th>
                  <th className="px-4 py-2 font-medium">Tickets</th>
                  <th className="px-4 py-2 font-medium">Gross earned</th>
                </tr>
              </thead>
              <tbody>
                {data.artists.map((a) => (
                  <tr key={a.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{a.name}</td>
                    <td className="px-4 py-2.5 text-black/55">{payLabel(a)}</td>
                    <td className="px-4 py-2.5 tnum text-black/60">{a.saleCount}</td>
                    <td className="px-4 py-2.5 tnum font-medium">{fmtPrecise(a.artistEarnings)}</td>
                  </tr>
                ))}
                {data.artists.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-black/40">
                      Nothing to report for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          {/* ── Deposits & supplies ── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <SectionTitle>Deposits</SectionTitle>
              <Card>
                <div className="grid grid-cols-3 divide-x divide-black/5">
                  <DepCell label="Held" value={fmt(data.deposits.held)} />
                  <DepCell label="Applied" value={fmt(data.deposits.applied)} />
                  <DepCell label="Forfeited" value={fmt(data.deposits.forfeited)} tone="good" />
                </div>
                <div className="border-t border-black/5 px-4 py-2.5 text-xs text-black/40">
                  {data.deposits.count} booking{data.deposits.count === 1 ? "" : "s"} with a deposit ·
                  forfeited no-show deposits count as shop revenue
                </div>
              </Card>
            </div>
            <div>
              <SectionTitle>Supplies</SectionTitle>
              <Card>
                <div className="grid grid-cols-2 divide-x divide-black/5">
                  <DepCell label="Stock on hand" value={fmt(data.expenses.supplyValueCents)} />
                  <DepCell label="Items tracked" value={String(data.expenses.supplyItems)} />
                </div>
                <div className="border-t border-black/5 px-4 py-2.5 text-xs text-black/40">
                  Current inventory value (qty × unit cost). Supplies expenses with a restock
                  attached land here too.
                </div>
              </Card>
            </div>
          </div>

          <Insights />
        </>
      ) : null}
    </div>
  );
}

function DepCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good";
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-black/45">{label}</div>
      <div
        className={`tnum mt-1 text-xl font-semibold ${tone === "good" ? "text-emerald-600" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}
