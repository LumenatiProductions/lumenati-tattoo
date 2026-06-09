"use client";

import { useState } from "react";
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
  const { expenses, loading, error, totalCents, byCategory, addExpense, removeExpense } = useExpenses();

  const exportCsv = () =>
    downloadCsv(`lumenati-expenses-${new Date().toISOString().slice(0, 10)}.csv`, expensesCsv(expenses));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Expenses &amp; Books</h1>
        <p className="text-sm text-black/50">
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

      {error && (
        <Card className="mb-5">
          <div className="px-4 py-3 text-sm text-rose-600">{error}</div>
        </Card>
      )}

      <SectionTitle
        action={
          <button
            onClick={exportCsv}
            disabled={!expenses.length}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-black/60 hover:bg-black/4 disabled:opacity-40"
          >
            Export CSV
          </button>
        }
      >
        Logged expenses
      </SectionTitle>
      <Card className="mb-6">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-black/40">Loading…</div>
        ) : expenses.length === 0 && !error ? (
          <div className="px-4 py-10 text-center text-sm text-black/40">
            No expenses logged yet. Add the shop&apos;s supplies, rent, and bills above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/45">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 tnum text-black/60">{e.date}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral">{e.category}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {e.vendor || <span className="text-black/30">—</span>}
                    {e.note && <div className="text-xs text-black/40">{e.note}</div>}
                  </td>
                  <td className="px-4 py-2.5 tnum font-medium">{usd(e.amount_cents)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => removeExpense(e.id)}
                      className="text-xs text-black/35 hover:text-rose-600"
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

  const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-black/45";

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
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/8 bg-black/2 p-3 sm:col-span-5">
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

        {err && <div className="text-xs text-rose-600 sm:col-span-5">{err}</div>}
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
