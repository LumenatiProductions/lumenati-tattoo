"use client";

import { useMemo, useState } from "react";
import { useInventory, type InventoryItem, type InventoryInput } from "@/lib/admin/inventory-context";
import { isLow, categoryLabel, CATEGORY_LABELS } from "@/lib/inventory/job";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS);
const UNIT_OPTIONS = ["each", "box", "bottle"];

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
// Retail prices keep their cents ($25.00 and $4.50 both read right).
const usd2 = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// Display order for the category groups (supplies-first, unknowns fall last).
const CATEGORY_ORDER = ["needle", "ink", "tube", "glove", "disposable", "aftercare", "other"];

type StockTone = "good" | "warn" | "bad";
function stockTone(item: InventoryItem): StockTone {
  if (item.qty <= 0) return "bad";
  if (isLow(item.qty, item.reorder_at)) return "warn";
  return "good";
}
const TONE_BADGE: Record<StockTone, "good" | "warn" | "bad"> = {
  good: "good",
  warn: "warn",
  bad: "bad",
};
const TONE_LABEL: Record<StockTone, string> = {
  good: "In stock",
  warn: "Low",
  bad: "Out",
};

export default function InventoryPage() {
  const { items, loading, error, lowStock, stockValueCents, addItem, updateItem, adjustQty, removeItem } =
    useInventory();

  const stats = useMemo(() => {
    const out = items.filter((i) => i.qty <= 0).length;
    return { tracked: items.length, low: lowStock.length, out, value: stockValueCents };
  }, [items, lowStock, stockValueCents]);

  // Group by category, in the display order above (unknown categories fall last).
  const groups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    const ordered = [...map.keys()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99),
    );
    return ordered.map((cat) => [cat, map.get(cat)!] as const);
  }, [items]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <p className="text-sm text-black/50">
          Needles, ink, gloves, tubes, and disposables — with a reorder point on each so you
          restock before you run out mid-session.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Items tracked" value={String(stats.tracked)} accent />
        <StatCard
          label="Low / out"
          value={String(stats.low)}
          sub={stats.out ? `${stats.out} fully out` : "at reorder point"}
          tone={stats.low ? "warn" : "neutral"}
        />
        <StatCard label="Stock value" value={usd(stats.value)} sub="qty × unit cost" />
        <StatCard label="Categories" value={String(groups.length)} />
      </div>

      {/* The whole point: what needs reordering, up top, with supplier links. */}
      {lowStock.length > 0 && (
        <Card className="mb-5 ring-1 ring-amber-300/60">
          <div className="p-4">
            <div className="mb-2 text-sm font-semibold text-amber-800">
              {lowStock.length} item{lowStock.length === 1 ? "" : "s"} need reordering
            </div>
            <div className="flex flex-col gap-1.5">
              {lowStock.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {it.brand && <span className="text-black/45">{it.brand} </span>}
                    {it.name}
                    {it.color && <span className="text-black/40"> · {it.color}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={it.qty <= 0 ? "text-rose-600" : "text-amber-600"}>
                      {it.qty} {it.unit}
                      {it.qty === 1 ? "" : "s"} left
                      {it.reorder_qty > 0 && ` · reorder ${it.reorder_qty}`}
                    </span>
                    {it.supplier_url ? (
                      <a
                        href={it.supplier_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand underline"
                      >
                        {it.supplier || "Order"} →
                      </a>
                    ) : (
                      it.supplier && <span className="text-black/40">{it.supplier}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <AddItemForm onAdd={addItem} />

      {error && (
        <Card className="mb-5">
          <div className="px-4 py-3 text-sm text-rose-600">{error}</div>
        </Card>
      )}

      {loading ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">Loading inventory…</div>
        </Card>
      ) : items.length === 0 && !error ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">
            No supplies tracked yet. Add needles, ink, gloves, or anything you reorder above.
          </div>
        </Card>
      ) : (
        groups.map(([cat, list]) => (
          <div key={cat} className="mb-5">
            <SectionTitle>{categoryLabel(cat)}</SectionTitle>
            <ItemTable items={list} onAdjust={adjustQty} onUpdate={updateItem} onRemove={removeItem} />
          </div>
        ))
      )}
    </div>
  );
}

function ItemTable({
  items,
  onAdjust,
  onUpdate,
  onRemove,
}: {
  items: InventoryItem[];
  onAdjust: ReturnType<typeof useInventory>["adjustQty"];
  onUpdate: ReturnType<typeof useInventory>["updateItem"];
  onRemove: (id: string) => void;
}) {
  return (
    <Card>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/45">
            <th className="px-4 py-2 font-medium">Item</th>
            <th className="px-4 py-2 font-medium">On hand</th>
            <th className="px-4 py-2 font-medium" title="Flags as low when qty drops to this">Reorder at</th>
            <th className="px-4 py-2 font-medium" title="Set a price to sell this at the register">Sells for</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const tone = stockTone(it);
            return (
              <tr key={it.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="font-medium">
                    {it.brand && <span className="text-black/45">{it.brand} </span>}
                    {it.name}
                    {it.color && <span className="text-black/40"> · {it.color}</span>}
                  </div>
                  <div className="text-xs text-black/40">
                    {it.unit}
                    {it.cost_cents > 0 && ` · ${usd(it.cost_cents)}/${it.unit}`}
                    {it.supplier && (
                      <>
                        {" · "}
                        {it.supplier_url ? (
                          <a
                            href={it.supplier_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand underline"
                          >
                            {it.supplier}
                          </a>
                        ) : (
                          it.supplier
                        )}
                      </>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onAdjust(it.id, -1, "manual −1")}
                      disabled={it.qty <= 0}
                      className="h-6 w-6 rounded-md border border-black/10 text-black/60 hover:bg-black/5 disabled:opacity-30"
                      aria-label="Decrease"
                    >
                      −
                    </button>
                    <span className="tnum w-10 text-center font-medium">{it.qty}</span>
                    <button
                      onClick={() => onAdjust(it.id, 1, "manual +1")}
                      className="h-6 w-6 rounded-md border border-black/10 text-black/60 hover:bg-black/5"
                      aria-label="Increase"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2.5 tnum text-black/60">{it.reorder_at}</td>
                <td className="px-4 py-2.5">
                  <PriceCell item={it} onUpdate={onUpdate} />
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={TONE_BADGE[tone]}>{TONE_LABEL[tone]}</Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => window.confirm(`Stop tracking ${it.name}?`) && onRemove(it.id)}
                    className="text-xs text-black/35 hover:text-rose-600"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// The retail price, editable in place. A set price is what makes an item show
// up as a quick-tap product at the register (phone POS + cash page); clearing
// it takes the item off sale. Tax is added at the register, so this is the
// shelf price.
function PriceCell({
  item,
  onUpdate,
}: {
  item: InventoryItem;
  onUpdate: ReturnType<typeof useInventory>["updateItem"];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const dollars = Number(value);
    await onUpdate(item.id, {
      priceCents: Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null,
    });
    setBusy(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-black/40">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          disabled={busy}
          placeholder="0.00"
          className="w-20 rounded-md border border-black/10 px-2 py-1 text-sm"
          autoFocus
        />
      </span>
    );
  }

  return (
    <button
      onClick={() => {
        setValue(item.price_cents ? (item.price_cents / 100).toFixed(2) : "");
        setEditing(true);
      }}
      className={
        item.price_cents
          ? "tnum font-medium text-emerald-700 hover:underline"
          : "text-xs text-black/35 hover:text-black/60 hover:underline"
      }
      title={item.price_cents ? "Change the retail price (blank takes it off sale)" : "Set a retail price to sell this at the register"}
    >
      {item.price_cents ? usd2(item.price_cents) : "Set price"}
    </button>
  );
}

function AddItemForm({
  onAdd,
}: {
  onAdd: (input: InventoryInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("needle");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [unit, setUnit] = useState("each");
  const [qty, setQty] = useState("");
  const [reorderAt, setReorderAt] = useState("");
  const [reorderQty, setReorderQty] = useState("");
  const [cost, setCost] = useState(""); // dollars in the input; converted to cents on submit
  const [price, setPrice] = useState(""); // retail price — set = sellable at the register
  const [supplier, setSupplier] = useState("");
  const [supplierUrl, setSupplierUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setBrand("");
    setColor("");
    setQty("");
    setReorderAt("");
    setReorderQty("");
    setCost("");
    setPrice("");
    setSupplier("");
    setSupplierUrl("");
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Give the item a name.");
      return;
    }
    setBusy(true);
    setFormError(null);
    const dollars = Number(cost);
    const priceDollars = Number(price);
    const res = await onAdd({
      name: name.trim(),
      category,
      brand: brand || null,
      color: color || null,
      unit,
      qty: Number(qty) || 0,
      reorderAt: Number(reorderAt) || 0,
      reorderQty: Number(reorderQty) || 0,
      costCents: Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0,
      priceCents: Number.isFinite(priceDollars) && priceDollars > 0 ? Math.round(priceDollars * 100) : null,
      supplier: supplier || null,
      supplierUrl: supplierUrl || null,
    });
    setBusy(false);
    if (res.ok) {
      reset();
      setOpen(false);
    } else {
      setFormError(res.error || "Could not add that item.");
    }
  };

  const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-black/45";
  const isInk = category === "ink";

  if (!open) {
    return (
      <div className="mb-5">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Add item
        </button>
      </div>
    );
  }

  return (
    <Card className="mb-5">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <label className="sm:col-span-2">
          <span className={labelCls}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 3RL cartridges"
            className={field}
            autoFocus
          />
        </label>
        <label>
          <span className={labelCls}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {CATEGORY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Brand (optional)</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className={field} />
        </label>
        <label>
          <span className={labelCls}>{isInk ? "Color" : "Color (optional)"}</span>
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder={isInk ? "e.g. Lining Black" : "—"}
            className={field}
          />
        </label>
        <label>
          <span className={labelCls}>Unit</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={field}>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>On hand</span>
          <input
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className={field}
          />
        </label>
        <label>
          <span className={labelCls}>Reorder at</span>
          <input
            type="number"
            min="0"
            step="any"
            value={reorderAt}
            onChange={(e) => setReorderAt(e.target.value)}
            placeholder="0"
            className={field}
          />
        </label>
        <label>
          <span className={labelCls}>Reorder qty</span>
          <input
            type="number"
            min="0"
            step="any"
            value={reorderQty}
            onChange={(e) => setReorderQty(e.target.value)}
            placeholder="0"
            className={field}
          />
        </label>
        <label>
          <span className={labelCls}>Unit cost ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className={field}
          />
        </label>
        <label>
          <span className={labelCls}>Sells for ($, optional)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Retail price"
            title="Set a price and this item becomes a quick-tap product at the register"
            className={field}
          />
        </label>
        <label>
          <span className={labelCls}>Supplier (optional)</span>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={field} />
        </label>
        <label className="sm:col-span-2">
          <span className={labelCls}>Supplier URL (optional)</span>
          <input
            value={supplierUrl}
            onChange={(e) => setSupplierUrl(e.target.value)}
            placeholder="https://…"
            className={field}
          />
        </label>
        {formError && <div className="text-xs text-rose-600 sm:col-span-3">{formError}</div>}
        <div className="flex gap-2 sm:col-span-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save item"}
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="rounded-lg border border-black/10 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
