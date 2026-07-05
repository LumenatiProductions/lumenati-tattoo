"use client";

import { useCallback, useEffect, useState } from "react";
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
  const { entries, loading, error, configured, totalCents, outstandingCents, addEntry, toggleReconciled, refresh } =
    useCash();
  const [adding, setAdding] = useState(false);

  const doneCount = entries.filter((c) => c.reconciled).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cash Log</h1>
        <p className="text-sm text-white/65">
          The shop runs a lot of cash. Log it at the desk, reconcile against the
          drawer, and it flows into the books.
        </p>
      </div>

      {!configured && !loading && (
        <div className="mb-5 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          <span className="font-semibold">Not set up yet</span> — run{" "}
          <code className="font-mono">supabase/cash-schema.sql</code> in the Supabase SQL editor to
          turn the cash log on.
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      <DrawerPanel entriesVersion={entries.length} />

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

      {configured && <MerchQuickSale onSold={refresh} />}

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
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/55">
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
                <td colSpan={6} className="px-4 py-8 text-center text-white/55">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/55">
                  {configured
                    ? "No cash logged yet. Tap “+ Log cash” when money hits the drawer."
                    : "The cash log turns on once the schema is applied."}
                </td>
              </tr>
            )}
            {entries.map((c: CashEntry) => {
              const a = artists.find((x) => x.id === c.artist_id);
              return (
                <tr key={c.id} className="border-b border-white/8 last:border-0">
                  <td className="px-4 py-2.5 text-white/70">{fmtDate(c.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      {a ? <Dot color={a.color} /> : null}
                      {a?.name ?? "Shop"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{c.note || <span className="text-white/45">—</span>}</td>
                  <td className="px-4 py-2.5 text-white/60">{c.entered_by ?? "—"}</td>
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

// Drawer discipline: open with a float, close by counting. Expected updates
// live as entries land (entriesVersion re-fetches when the log changes). Stays
// hidden until cash-sessions-schema.sql is applied.
function DrawerPanel({ entriesVersion }: { entriesVersion: number }) {
  type Session = {
    id: string;
    opened_at: string;
    opened_by: string | null;
    opening_float_cents: number;
    closed_at: string | null;
    expected_cents: number | null;
    counted_cents: number | null;
    over_short_cents: number | null;
    note: string;
  };
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState<Session | null>(null);
  const [expectedSoFar, setExpectedSoFar] = useState<number | null>(null);
  const [recent, setRecent] = useState<Session[]>([]);
  const [float, setFloat] = useState("");
  const [counted, setCounted] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/cash/session");
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.configured !== false) {
        setConfigured(true);
        setOpen(d.open ?? null);
        setExpectedSoFar(d.expectedSoFar ?? null);
        setRecent(d.recent ?? []);
      }
    } catch {
      /* panel stays hidden */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, entriesVersion]);

  if (!configured) return null;

  const act = async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/cash/session", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || "Could not update the drawer.");
        return;
      }
      setFloat("");
      setCounted("");
      if (method === "PATCH" && d.session) {
        const os = d.session.over_short_cents as number;
        setMsg(
          os === 0
            ? "Drawer closed — counted exactly to the penny."
            : `Drawer closed — ${os > 0 ? "over" : "short"} ${fmtPrecise(Math.abs(os))}.`,
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toCents = (s: string) => Math.round(Number(s) * 100);

  return (
    <div className="mb-5">
      <SectionTitle>Drawer</SectionTitle>
      <Card>
        <div className="flex flex-wrap items-end gap-4 p-4">
          {open ? (
            <>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-white/60">Opened</div>
                <div className="text-sm font-medium">
                  {new Date(open.opened_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  <span className="text-white/55"> · float {fmtPrecise(open.opening_float_cents)}</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-white/60">Expected in drawer</div>
                <div className="tnum text-sm font-semibold">{expectedSoFar !== null ? fmtPrecise(expectedSoFar) : "—"}</div>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/60">Counted ($)</span>
                <input className="inp w-28" inputMode="decimal" placeholder="0.00" value={counted} onChange={(e) => setCounted(e.target.value)} />
              </label>
              <button
                onClick={() => {
                  const c = toCents(counted);
                  if (!Number.isFinite(c) || counted.trim() === "") {
                    setMsg("Count the drawer first.");
                    return;
                  }
                  act("PATCH", { countedCents: c });
                }}
                disabled={busy}
                className="rounded-lg bg-white/14 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Closing…" : "Count & close"}
              </button>
            </>
          ) : (
            <>
              <div className="text-sm text-white/70">Drawer is closed.</div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/60">Opening float ($)</span>
                <input className="inp w-28" inputMode="decimal" placeholder="200" value={float} onChange={(e) => setFloat(e.target.value)} />
              </label>
              <button
                onClick={() => {
                  const c = toCents(float || "0");
                  act("POST", { openingFloatCents: Number.isFinite(c) ? c : 0 });
                }}
                disabled={busy}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Opening…" : "Open drawer"}
              </button>
            </>
          )}
          {msg && <span className="text-xs font-medium text-white/75">{msg}</span>}
        </div>

        {recent.length > 0 && (
          <div className="border-t border-white/8 px-4 py-2.5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-white/60">
              {recent.map((s) => (
                <span key={s.id}>
                  {new Date(s.opened_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}:{" "}
                  {s.over_short_cents === 0 ? (
                    <span className="text-emerald-400">even</span>
                  ) : (
                    <span className={s.over_short_cents! > 0 ? "text-emerald-400" : "text-rose-400"}>
                      {s.over_short_cents! > 0 ? "+" : "−"}
                      {fmtPrecise(Math.abs(s.over_short_cents!))}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// Quick-tap merch: every inventory item with a retail price becomes a button.
// Tap what sold, hit log — the server prices it, splits the tax out, books the
// ledger rows, and takes the stock down. Renders nothing until a product has a
// price (set on the Inventory page). Cash only here; card merch rings up on
// the phone's Tap to Pay screen.
function MerchQuickSale({ onSold }: { onSold: () => Promise<void> | void }) {
  const [products, setProducts] = useState<
    { id: string; name: string; brand: string | null; qty: number; price_cents: number }[]
  >([]);
  const [taxBps, setTaxBps] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pos/products")
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.items ?? []);
        setTaxBps(Number(d.taxBps) || 0);
      })
      .catch(() => {});
  }, []);

  const lines = Object.entries(cart)
    .map(([id, qty]) => {
      const p = products.find((x) => x.id === id);
      return p ? { id, name: p.name, qty, price_cents: p.price_cents } : null;
    })
    .filter((l): l is NonNullable<typeof l> => !!l);
  const subtotal = lines.reduce((s, l) => s + l.price_cents * l.qty, 0);
  const tax = Math.round((subtotal * taxBps) / 10000);
  const total = subtotal + tax;

  const sell = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/pos/merch-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(d.error || "Could not record the sale.");
      return;
    }
    setCart({});
    setMsg(`Sold — ${fmtPrecise(d.totalCents)} logged, stock updated.`);
    await onSold();
  };

  if (products.length === 0) return null;

  return (
    <Card className="mb-5">
      <div className="p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/60">
          Merch — cash sale
        </div>
        <div className="flex flex-wrap gap-2">
          {products.map((p) => {
            const n = cart[p.id] ?? 0;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setMsg(null);
                  setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
                }}
                disabled={busy}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  n > 0 ? "border-brand bg-brand/5 font-semibold" : "border-white/12 hover:bg-white/7"
                } disabled:opacity-40`}
              >
                {n > 0 && <span className="mr-1.5 rounded bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">{n}</span>}
                {p.brand ? `${p.brand} ` : ""}
                {p.name}
                <span className="ml-1.5 text-white/60">{fmtPrecise(p.price_cents)}</span>
              </button>
            );
          })}
        </div>
        {lines.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="tnum text-sm text-white/75">
              {fmtPrecise(subtotal)}
              {tax > 0 && ` + ${fmtPrecise(tax)} tax`}
              <span className="ml-1.5 font-semibold text-white">= {fmtPrecise(total)}</span>
            </span>
            <button
              onClick={sell}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Logging…" : "Log cash sale"}
            </button>
            <button
              onClick={() => setCart({})}
              disabled={busy}
              className="text-xs text-white/55 hover:text-white/75"
            >
              Clear
            </button>
          </div>
        )}
        {msg && <div className="mt-2 text-xs font-medium text-white/75">{msg}</div>}
      </div>
    </Card>
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
    taxCents?: number;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [artistId, setArtistId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [taxable, setTaxable] = useState(false);
  const [taxBps, setTaxBps] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // The shop's tax rate, for splitting tax out of taxable product sales.
  useEffect(() => {
    fetch("/api/tax-rate")
      .then((r) => r.json())
      .then((d) => setTaxBps(Number(d.bps) || 0))
      .catch(() => {});
  }, []);

  // Tax is INSIDE the amount the client handed over: back it out of the total.
  const amountCents = Math.round(Number(amount) * 100);
  const taxCents =
    taxable && taxBps > 0 && Number.isFinite(amountCents) && amountCents > 0
      ? Math.round(amountCents - amountCents / (1 + taxBps / 10000))
      : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      setMsg("Enter the cash amount.");
      return;
    }
    setBusy(true);
    const res = await addEntry({ date, artistId: artistId || null, amountCents, taxCents, note });
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
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/60">Date</span>
          <input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/60">Who</span>
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
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/60">Amount ($)</span>
          <input
            className="inp w-28"
            inputMode="decimal"
            placeholder="120"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block grow">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/60">Note</span>
          <input
            className="inp w-full"
            placeholder="walk-in flash, drawer drop…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {taxBps > 0 && (
          <label className="flex items-center gap-1.5 pb-2 text-xs text-white/70">
            <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
            Taxable product
            {taxable && taxCents > 0 && (
              <span className="tnum text-white/55">(incl. ${(taxCents / 100).toFixed(2)} tax)</span>
            )}
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Logging…" : "Log it"}
        </button>
        {msg && <span className="text-xs text-rose-400">{msg}</span>}
      </form>
    </Card>
  );
}
