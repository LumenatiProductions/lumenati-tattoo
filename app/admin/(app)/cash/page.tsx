"use client";

import { useState } from "react";
import { useArtists } from "@/lib/admin/artists-context";
import { useCash, type CashEntry } from "@/lib/admin/cash-context";
import { fmtPrecise } from "@/lib/admin/calc";
import { Card, SectionTitle, Badge, Dot, StatCard } from "@/components/admin/ui";

// Real drawer log backed by /api/cash (cash_entries). Until the schema is
// applied the API reports configured:false and the page shows the setup hint.

const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export default function CashPage() {
  const { artists } = useArtists();
  const { entries, loading, error, configured, totalCents, outstandingCents, addEntry, toggleReconciled } =
    useCash();
  const [adding, setAdding] = useState(false);

  const doneCount = entries.filter((c) => c.reconciled).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cash Log</h1>
        <p className="text-sm text-black/50">
          The shop runs a lot of cash. Log it at the desk, reconcile against the
          drawer, and it flows into the books.
        </p>
      </div>

      {!configured && !loading && (
        <div className="mb-5 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">Not set up yet</span> — run{" "}
          <code className="font-mono">supabase/cash-schema.sql</code> in the Supabase SQL editor to
          turn the cash log on.
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash logged" value={fmtPrecise(totalCents)} sub="all entries" />
        <StatCard
          label="Unreconciled"
          value={fmtPrecise(outstandingCents)}
          tone={outstandingCents ? "warn" : "good"}
        />
        <StatCard label="Entries" value={String(entries.length)} />
        <StatCard label="Reconciled" value={`${doneCount}/${entries.length}`} tone="good" />
      </div>

      <SectionTitle
        action={
          <button
            onClick={() => setAdding((v) => !v)}
            disabled={!configured}
            title={configured ? undefined : "Apply cash-schema.sql first"}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {adding ? "Close" : "+ Log cash"}
          </button>
        }
      >
        Drawer entries
      </SectionTitle>

      {adding && configured && (
        <AddEntry artists={artists} addEntry={addEntry} onAdded={() => setAdding(false)} />
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/40">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Who</th>
              <th className="px-4 py-2.5 font-medium">Note</th>
              <th className="px-4 py-2.5 font-medium">Entered by</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black/40">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black/40">
                  {configured
                    ? "No cash logged yet. Tap “+ Log cash” when money hits the drawer."
                    : "The cash log turns on once the schema is applied."}
                </td>
              </tr>
            )}
            {entries.map((c: CashEntry) => {
              const a = artists.find((x) => x.id === c.artist_id);
              return (
                <tr key={c.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 text-black/55">{fmtDate(c.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      {a ? <Dot color={a.color} /> : null}
                      {a?.name ?? "Shop"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{c.note || <span className="text-black/30">—</span>}</td>
                  <td className="px-4 py-2.5 text-black/45">{c.entered_by ?? "—"}</td>
                  <td className="tnum px-4 py-2.5 text-right font-medium">{fmtPrecise(c.amount_cents)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => toggleReconciled(c.id, !c.reconciled)}
                      className="align-middle"
                      title="Toggle reconciled"
                    >
                      {c.reconciled ? (
                        <Badge tone="good">reconciled</Badge>
                      ) : (
                        <Badge tone="warn">open</Badge>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AddEntry({
  artists,
  addEntry,
  onAdded,
}: {
  artists: { id: string; name: string }[];
  addEntry: (input: {
    date?: string;
    artistId?: string | null;
    amountCents: number;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [artistId, setArtistId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      setMsg("Enter the cash amount.");
      return;
    }
    setBusy(true);
    const res = await addEntry({ date, artistId: artistId || null, amountCents, note });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error || "Could not log that.");
      return;
    }
    onAdded();
  };

  return (
    <Card className="mb-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Date</span>
          <input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Who</span>
          <select className="inp" value={artistId} onChange={(e) => setArtistId(e.target.value)}>
            <option value="">Shop</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Amount ($)</span>
          <input
            className="inp w-28"
            inputMode="decimal"
            placeholder="120"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block grow">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Note</span>
          <input
            className="inp w-full"
            placeholder="walk-in flash, drawer drop…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Logging…" : "Log it"}
        </button>
        {msg && <span className="text-xs text-rose-600">{msg}</span>}
      </form>
    </Card>
  );
}
