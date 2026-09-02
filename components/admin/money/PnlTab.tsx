"use client";

import { TabHeader } from "@/components/admin/money/shared";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, StatCard } from "@/components/admin/ui";
import ProfitChart from "@/components/admin/ProfitChart";
import { todayLocal } from "@/lib/dates";

// Profit & Loss — the one screen that answers "did the shop make money".
// Money in (ledger) minus money out (expenses) = profit, by month/quarter/year.
// Owner draws sit below the line; sales tax collected shows as owed.

type Period = {
  key: string;
  grossCollected: number;
  artistShare: number;
  passThrough: number;
  renterCash: number;
  splitIncome: number;
  unattributedIncome: number;
  rentIncome: number;
  forfeitedDeposits: number;
  income: number;
  expensesByCategory: Record<string, number>;
  expensesTotal: number;
  profit: number;
  draws: number;
  taxCollected: number;
};
type PnlData = { range: { from: string; to: string }; group: string; periods: Period[]; totals: Period };
type Draw = { id: string; date: string; amount_cents: number; method: string; note: string };

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdSigned = (cents: number) => (cents < 0 ? `-${usd(-cents)}` : usd(cents));

const thisYear = new Date().getUTCFullYear();
const YEARS: number[] = [];
for (let y = thisYear; y >= 2021; y--) YEARS.push(y);

// Period keys ('2026-03', '2026-Q1', '2026') -> readable labels.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function periodLabel(key: string): string {
  if (/^\d{4}$/.test(key)) return key;
  if (/^\d{4}-Q\d$/.test(key)) return `Q${key.slice(6)} ${key.slice(0, 4)}`;
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

export default function PnlPage() {
  const [scope, setScope] = useState<string>(String(thisYear)); // a year, or "all"
  const [group, setGroup] = useState<"month" | "quarter" | "year">("month");
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (scope === "all") return { from: "2021-01-01", to: todayLocal() };
    const isCurrent = scope === String(thisYear);
    return { from: `${scope}-01-01`, to: isCurrent ? todayLocal() : `${scope}-12-31` };
  }, [scope]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pnl?from=${range.from}&to=${range.to}&group=${group}`);
      const d = await r.json();
      if (!r.ok) {
        setError(r.status === 403 ? "Admins only." : d.error || "Could not load the P&L.");
        setData(null);
      } else {
        setData(d);
        setError(null);
      }
    } catch {
      setError("Could not load the P&L.");
    } finally {
      setLoading(false);
    }
  }, [range, group]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const t = data?.totals;
  const margin = t && t.income > 0 ? Math.round((t.profit / t.income) * 100) : null;
  const catList = useMemo(
    () => Object.entries(t?.expensesByCategory ?? {}).sort((a, b) => b[1] - a[1]),
    [t],
  );

  return (
    <div>
      <TabHeader
        title="Profit & Loss"
        subtitle={
          <>Money in minus money out, the shop&apos;s actual profit. Admins only.</>
        }
        action={
          <>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-sm"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="all">All time (2021+)</option>
            </select>
            {(["month", "quarter", "year"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  group === g ? "bg-white/14 text-white" : "border border-white/12 text-white/75 hover:bg-white/6"
                }`}
              >
                {g === "month" ? "Monthly" : g === "quarter" ? "Quarterly" : "Yearly"}
              </button>
            ))}
          </>
        }
      />

      {error && (
        <Card className="mb-5">
          <div className="px-4 py-3 text-sm text-rose-400">{error}</div>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Shop income" value={usd(t?.income ?? 0)} sub="Splits + rent + shop sales" />
        <StatCard label="Expenses" value={usd(t?.expensesTotal ?? 0)} />
        <StatCard
          label="Profit"
          value={usdSigned(t?.profit ?? 0)}
          sub={margin !== null ? `${margin}% margin` : undefined}
          accent
          tone={(t?.profit ?? 0) >= 0 ? "good" : "warn"}
        />
        <StatCard label="Owner draws" value={usd(t?.draws ?? 0)} sub="Below the line" />
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <div>
            <span className="font-medium">Sales tax collected in this range (owed to the state)</span>
            <span className="ml-3 tnum font-semibold">{usd(t?.taxCollected ?? 0)}</span>
          </div>
          <TaxRateInline />
        </div>
      </Card>

      {data && data.periods.length > 1 && (
        <Card className="mb-6 px-4 pb-3 pt-4">
          <ProfitChart
            points={data.periods.map((p) => ({ key: p.key, label: periodLabel(p.key), profit: p.profit }))}
          />
        </Card>
      )}

      <SectionTitle
        action={
          <div className="flex gap-2">
            <a
              href={`/api/pnl?from=${range.from}&to=${range.to}&group=${group}&format=csv`}
              className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/6"
            >
              P&amp;L CSV
            </a>
            <a
              href={`/api/ledger/export?from=${range.from}&to=${range.to}`}
              className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/6"
            >
              General ledger CSV
            </a>
          </div>
        }
      >
        By {group}
      </SectionTitle>
      <Card className="mb-6 overflow-x-auto">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-white/55">Loading…</div>
        ) : !data || data.periods.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-white/55">No money activity in this range.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/60">
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 text-right font-medium">Gross collected</th>
                <th className="px-4 py-2 text-right font-medium">Artist share</th>
                <th className="px-4 py-2 text-right font-medium">Pass-through</th>
                <th className="px-4 py-2 text-right font-medium">Shop income</th>
                <th className="px-4 py-2 text-right font-medium">Expenses</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p) => (
                <tr key={p.key} className="border-b border-white/8 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{periodLabel(p.key)}</td>
                  <td className="tnum px-4 py-2.5 text-right text-white/75">{usd(p.grossCollected)}</td>
                  <td className="tnum px-4 py-2.5 text-right text-white/75">{usd(p.artistShare)}</td>
                  <td className="tnum px-4 py-2.5 text-right text-white/75">{usd(p.passThrough)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{usd(p.income)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{usd(p.expensesTotal)}</td>
                  <td
                    className={`tnum px-4 py-2.5 text-right font-semibold ${
                      p.profit < 0 ? "text-rose-400" : "text-emerald-300"
                    }`}
                  >
                    {usdSigned(p.profit)}
                  </td>
                </tr>
              ))}
              {t && (
                <tr className="border-t-2 border-white/12 bg-white/4 font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="tnum px-4 py-2.5 text-right">{usd(t.grossCollected)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{usd(t.artistShare)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{usd(t.passThrough)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{usd(t.income)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{usd(t.expensesTotal)}</td>
                  <td className={`tnum px-4 py-2.5 text-right ${t.profit < 0 ? "text-rose-400" : "text-emerald-300"}`}>
                    {usdSigned(t.profit)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {t && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <SectionTitle>Where the income comes from</SectionTitle>
            <Card>
              <div className="divide-y divide-white/8 text-sm">
                <Line label="Shop's cut of tickets (splits + the owner's sales)" value={t.splitIncome} />
                <Line label="Shop sales (no artist attached: walk-ins, guests, products)" value={t.unattributedIncome} />
                <Line label="Booth rent collected" value={t.rentIncome} />
                <Line label="Forfeited deposits" value={t.forfeitedDeposits} />
                <Line label="Total shop income" value={t.income} bold />
              </div>
            </Card>
            <p className="mt-2 px-1 text-xs text-white/55">
              Renter pass-through ({usd(t.passThrough)}) is renters&apos; card money the shop&apos;s reader
              collected and is holding for them. It shows in Gross collected and its own column, never
              in income.{t.renterCash > 0 ? ` Renters also took ${usd(t.renterCash)} in cash at the chair; that never touched the shop and is in neither.` : ""}
            </p>
          </div>
          <div>
            <SectionTitle>Where the money goes</SectionTitle>
            <Card>
              <div className="divide-y divide-white/8 text-sm">
                {catList.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-white/55">
                    No expenses logged in this range yet. Log bills on the Expenses page and they land here.
                  </div>
                )}
                {catList.map(([cat, cents]) => (
                  <Line key={cat} label={cat[0].toUpperCase() + cat.slice(1)} value={cents} />
                ))}
                {catList.length > 0 && <Line label="Total expenses" value={t.expensesTotal} bold />}
              </div>
            </Card>
          </div>
        </div>
      )}

      <DrawsSection onChange={refresh} />
    </div>
  );
}

// The shop's tax rate — used by the Cash Log to split tax out of taxable
// product sales. Stored in basis points; edited here as a percent.
function TaxRateInline() {
  const [bps, setBps] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tax-rate")
      .then((r) => r.json())
      .then((d) => setBps(Number(d.bps) || 0))
      .catch(() => setBps(0));
  }, []);

  const save = async () => {
    const newBps = Math.round((Number(pct) || 0) * 100);
    const r = await fetch("/api/tax-rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bps: newBps }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error || "Could not save.");
      return;
    }
    setBps(d.bps);
    setEditing(false);
    setErr(null);
  };

  if (bps === null) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-white/70">
      {editing ? (
        <>
          <span>Tax rate</span>
          <input
            type="number"
            min="0"
            max="20"
            step="0.01"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className="w-20 rounded-lg border border-white/12 bg-white/6 px-2 py-1 text-xs"
            placeholder="7.25"
          />
          <span>%</span>
          <button onClick={save} className="font-semibold text-brand">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-white/55">
            Cancel
          </button>
          {err && <span className="text-rose-400">{err}</span>}
        </>
      ) : (
        <>
          <span>
            Tax rate: <span className="tnum font-medium">{(bps / 100).toFixed(2)}%</span>
            {bps === 0 && " · set it and the Cash Log can split tax out of product sales"}
          </span>
          <button
            onClick={() => {
              setPct((bps / 100).toFixed(2));
              setEditing(true);
            }}
            className="font-medium text-brand"
          >
            Edit
          </button>
        </>
      )}
    </div>
  );
}

function Line({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-white/75"}>{label}</span>
      <span className="tnum">{usd(value)}</span>
    </div>
  );
}

// Owner draws — record money taken out of the business. Not an expense; it
// never changes profit, so it lives on this page below the line.
function DrawsSection({ onChange }: { onChange: () => void }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [date, setDate] = useState(todayLocal());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/draws");
    const d = await r.json().catch(() => ({}));
    if (r.ok) setDraws(d.draws || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round((Number(amount) || 0) * 100);
    if (cents < 1) {
      setErr("Enter an amount.");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/draws", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, amountCents: cents, method, note }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "Could not record that draw.");
      return;
    }
    setAmount("");
    setNote("");
    await load();
    onChange();
  };

  const remove = async (id: string) => {
    await fetch(`/api/draws?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
    onChange();
  };

  const field = "w-full rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-sm";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-white/60";

  return (
    <div>
      <SectionTitle>Owner draws</SectionTitle>
      <Card className="mb-4">
        <form onSubmit={add} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-5">
          <label>
            <span className={labelCls}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label>
            <span className={labelCls}>Amount ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={field}
            />
          </label>
          <label>
            <span className={labelCls}>How</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
              <option value="transfer">Transfer</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          {err && <div className="text-xs text-rose-400 sm:col-span-5">{err}</div>}
          <div className="sm:col-span-5">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Recording…" : "Record draw"}
            </button>
          </div>
        </form>
      </Card>
      {draws.length > 0 && (
        <Card className="mb-6">
          <table className="w-full text-sm">
            <tbody>
              {draws.map((d) => (
                <tr key={d.id} className="border-b border-white/8 last:border-0">
                  <td className="tnum px-4 py-2.5 text-white/75">{d.date}</td>
                  <td className="px-4 py-2.5 capitalize text-white/75">{d.method}</td>
                  <td className="px-4 py-2.5 text-white/75">{d.note || ""}</td>
                  <td className="tnum px-4 py-2.5 text-right font-medium">{usd(d.amount_cents)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => remove(d.id)} className="text-xs text-white/50 hover:text-rose-400">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
