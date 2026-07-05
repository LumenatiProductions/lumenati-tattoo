"use client";

import { useCallback, useEffect, useState } from "react";
import { ExpensesProvider, useExpenses, type ExpenseInput } from "@/lib/admin/expenses-context";
import { useInventory } from "@/lib/admin/inventory-context";
import { expensesCsv, downloadCsv } from "@/lib/books/export";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";
import StripeLedger from "@/components/admin/books/StripeLedger";

const CATEGORIES = ["supplies", "rent", "utilities", "software", "equipment", "fees", "other"];
const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function ExpensesPage() {
  return (
    <ExpensesProvider>
      <Inner />
    </ExpensesProvider>
  );
}

function Inner() {
  const { expenses, loading, error, totalCents, byCategory, addExpense, removeExpense, refresh } = useExpenses();

  const exportCsv = () =>
    downloadCsv(`lumenati-expenses-${new Date().toISOString().slice(0, 10)}.csv`, expensesCsv(expenses));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Expenses &amp; Books</h1>
        <p className="text-sm text-white/65">
          The shop&apos;s outgoing money (supplies, rent, utilities, software). With Reports + Stripe,
          this is your full books — hand the export to your accountant instead of QuickBooks.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total logged" value={usd(totalCents)} accent />
        <StatCard label="Supplies" value={usd(byCategory.supplies ?? 0)} />
        <StatCard label="Rent" value={usd(byCategory.rent ?? 0)} />
        <StatCard label="Entries" value={String(expenses.length)} />
      </div>

      <AddForm onAdd={addExpense} />

      <RecurringBills onPosted={refresh} />

      {error && (
        <Card className="mb-5">
          <div className="px-4 py-3 text-sm text-rose-400">{error}</div>
        </Card>
      )}

      <SectionTitle
        action={
          <button
            onClick={exportCsv}
            disabled={!expenses.length}
            className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/6 disabled:opacity-40"
          >
            Export CSV
          </button>
        }
      >
        Logged expenses
      </SectionTitle>
      <Card className="mb-6">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-white/55">Loading…</div>
        ) : expenses.length === 0 && !error ? (
          <div className="px-4 py-10 text-center text-sm text-white/55">
            No expenses logged yet. Add the shop&apos;s supplies, rent, and bills above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/60">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-white/8 last:border-0">
                  <td className="px-4 py-2.5 tnum text-white/75">{e.date}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral">{e.category}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {e.vendor || <span className="text-white/45">—</span>}
                    {e.note && <div className="text-xs text-white/55">{e.note}</div>}
                  </td>
                  <td className="px-4 py-2.5 tnum font-medium">{usd(e.amount_cents)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => removeExpense(e.id)}
                      className="text-xs text-white/50 hover:text-rose-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Phase 2: the real money in/out from Stripe */}
      <StripeLedger />
    </div>
  );
}

// Recurring bills — the shop lease, utilities, software. A bill is a template:
// when its due date arrives, "Post" turns it into a real expense row (stamped
// so a period can never double-post) and the due date advances one step.
type Bill = {
  id: string;
  name: string;
  category: string;
  vendor: string | null;
  amount_cents: number;
  cadence: string;
  next_due: string;
  active: boolean;
  note: string;
};

function RecurringBills({ onPosted }: { onPosted: () => Promise<void> }) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/expenses/recurring");
    const d = await r.json().catch(() => ({}));
    if (r.ok) setBills(d.bills || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const due = bills.filter((b) => b.active && b.next_due <= today);

  const postDue = async (id?: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await fetch("/api/expenses/recurring/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "Could not post.");
      return;
    }
    const n = (d.posted || []).length;
    setMsg(n ? `Posted ${n} bill${n === 1 ? "" : "s"} to expenses.` : "Nothing was due.");
    await Promise.all([load(), onPosted()]);
  };

  const toggle = async (b: Bill) => {
    await fetch("/api/expenses/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, active: !b.active }),
    });
    await load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/expenses/recurring?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="mb-6">
      <SectionTitle
        action={
          <div className="flex items-center gap-2">
            {due.length > 0 && (
              <button
                onClick={() => postDue()}
                disabled={busy}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Posting…" : `Post ${due.length} due`}
              </button>
            )}
            <button
              onClick={() => setShowAdd((s) => !s)}
              className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/6"
            >
              {showAdd ? "Close" : "Add bill"}
            </button>
          </div>
        }
      >
        Recurring bills
      </SectionTitle>

      {showAdd && <AddBillForm onAdded={async () => (setShowAdd(false), await load())} />}
      {(msg || err) && (
        <div className={`mb-3 text-xs ${err ? "text-rose-400" : "text-emerald-300"}`}>{err || msg}</div>
      )}

      <Card>
        {bills.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-white/55">
            No recurring bills yet. Add the shop lease, utilities, and software here — they post to
            expenses automatically when due, so the P&amp;L stays real.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/60">
                <th className="px-4 py-2 font-medium">Bill</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Every</th>
                <th className="px-4 py-2 font-medium">Next due</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const isDue = b.active && b.next_due <= today;
                return (
                  <tr key={b.id} className={`border-b border-white/8 last:border-0 ${b.active ? "" : "opacity-45"}`}>
                    <td className="px-4 py-2.5 font-medium">
                      {b.name}
                      {b.vendor && <div className="text-xs font-normal text-white/55">{b.vendor}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone="neutral">{b.category}</Badge>
                    </td>
                    <td className="px-4 py-2.5 capitalize text-white/75">{b.cadence.replace("ly", "")}</td>
                    <td className="tnum px-4 py-2.5">
                      {isDue ? <Badge tone="warn">due {b.next_due}</Badge> : <span className="text-white/75">{b.next_due}</span>}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right font-medium">{usd(b.amount_cents)}</td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {isDue && (
                        <button onClick={() => postDue(b.id)} disabled={busy} className="mr-3 font-semibold text-brand">
                          Post
                        </button>
                      )}
                      <button onClick={() => toggle(b)} className="mr-3 text-white/60 hover:text-white/85">
                        {b.active ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => remove(b.id)} className="text-white/50 hover:text-rose-400">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function AddBillForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("rent");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [nextDue, setNextDue] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const field = "w-full rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-sm";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-white/60";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round((Number(amount) || 0) * 100);
    if (!name.trim() || cents < 1) {
      setErr("Give the bill a name and an amount.");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/expenses/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, vendor, amountCents: cents, cadence, nextDue }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "Could not add that bill.");
      return;
    }
    await onAdded();
  };

  return (
    <Card className="mb-3">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-6">
        <label>
          <span className={labelCls}>Bill name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop lease" className={field} />
        </label>
        <label>
          <span className={labelCls}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Vendor</span>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={field} />
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
          <span className={labelCls}>Repeats</span>
          <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={field}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Next due</span>
          <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={field} />
        </label>
        {err && <div className="text-xs text-rose-400 sm:col-span-6">{err}</div>}
        <div className="sm:col-span-6">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add recurring bill"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function AddForm({ onAdd }: { onAdd: (input: ExpenseInput) => Promise<{ ok: boolean; error?: string }> }) {
  const { items } = useInventory();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("supplies");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [restockItemId, setRestockItemId] = useState("");
  const [restockQty, setRestockQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const field = "w-full rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-sm";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-white/60";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round((Number(amount) || 0) * 100);
    if (cents < 1) {
      setErr("Enter an amount.");
      return;
    }
    const qty = Math.round(Number(restockQty));
    if (restockItemId && (!Number.isFinite(qty) || qty < 1)) {
      setErr("How many did you buy? Enter the restock quantity.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await onAdd({
      date,
      category,
      vendor: vendor || null,
      amountCents: cents,
      note,
      ...(category === "supplies" && restockItemId ? { restockItemId, restockQty: qty } : {}),
    });
    setBusy(false);
    if (res.ok) {
      setVendor("");
      setAmount("");
      setNote("");
      setRestockItemId("");
      setRestockQty("");
    } else {
      setErr(res.error || "Could not add.");
    }
  };

  return (
    <Card className="mb-5">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-5">
        <label>
          <span className={labelCls}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label>
          <span className={labelCls}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Vendor</span>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={field} />
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
          <span className={labelCls}>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>

        {/* Supplies purchases can land in inventory too — one entry, both books. */}
        {category === "supplies" && items.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/4 p-3 sm:col-span-5">
            <label>
              <span className={labelCls}>Also restock (optional)</span>
              <select value={restockItemId} onChange={(e) => setRestockItemId(e.target.value)} className={field}>
                <option value="">Don&apos;t touch inventory</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} ({it.qty} on hand)
                  </option>
                ))}
              </select>
            </label>
            {restockItemId && (
              <label>
                <span className={labelCls}>Qty received</span>
                <input
                  type="number"
                  min="1"
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  placeholder="0"
                  className={`${field} w-24`}
                />
              </label>
            )}
          </div>
        )}

        {err && <div className="text-xs text-rose-400 sm:col-span-5">{err}</div>}
        <div className="sm:col-span-5">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add expense"}
          </button>
        </div>
      </form>
    </Card>
  );
}
