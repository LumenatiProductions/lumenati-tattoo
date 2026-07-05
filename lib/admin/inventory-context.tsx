"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isLow } from "@/lib/inventory/job";

// Mirrors the DB row (snake_case) so the page reads it directly.
export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  color: string | null;
  unit: string;
  qty: number;
  reorder_at: number;
  reorder_qty: number;
  cost_cents: number;
  // Retail price. Set = this item sells at the POS (quick-tap button); null =
  // plain supplies. See supabase/2026-07-05-merch-pos.sql.
  price_cents: number | null;
  supplier: string | null;
  supplier_url: string | null;
  updated_at: string;
  created_at: string;
};

export type InventoryInput = {
  name: string;
  category?: string;
  brand?: string | null;
  color?: string | null;
  unit?: string;
  qty?: number;
  reorderAt?: number;
  reorderQty?: number;
  costCents?: number;
  priceCents?: number | null;
  supplier?: string | null;
  supplierUrl?: string | null;
};

type Result = { ok: boolean; error?: string };

type InventoryCtx = {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  // The Overview aggregate (BUILD-PLAN integration pass reads this): everything
  // at or below its reorder threshold, most-depleted first.
  lowStock: InventoryItem[];
  // Total stock value in cents (qty x unit cost) — Reports reads this later.
  stockValueCents: number;
  refresh: () => Promise<void>;
  addItem: (input: InventoryInput) => Promise<Result>;
  updateItem: (id: string, patch: Partial<InventoryInput>) => Promise<Result>;
  adjustQty: (id: string, delta: number, reason?: string) => Promise<Result>;
  removeItem: (id: string) => Promise<void>;
};

const noop = async () => ({ ok: false });
const Ctx = createContext<InventoryCtx>({
  items: [],
  loading: true,
  error: null,
  lowStock: [],
  stockValueCents: 0,
  refresh: async () => {},
  addItem: noop,
  updateItem: noop,
  adjustQty: noop,
  removeItem: async () => {},
});

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/inventory");
      const d = await r.json();
      if (r.ok) {
        setItems(d.items || []);
        setError(null);
      } else {
        // Non-staff (e.g. an artist) gets a 403 — that's expected, not an error.
        setError(r.status === 403 ? null : d.error || "Could not load inventory.");
        setItems([]);
      }
    } catch {
      setError("Could not load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem: InventoryCtx["addItem"] = useCallback(
    async (input) => {
      const r = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not add that item." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const updateItem: InventoryCtx["updateItem"] = useCallback(
    async (id, patch) => {
      const r = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not save that change." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const adjustQty: InventoryCtx["adjustQty"] = useCallback(
    async (id, delta, reason) => {
      // Optimistic: nudge the local qty so the +/- feels instant.
      setItems((p) =>
        p.map((x) => (x.id === id ? { ...x, qty: Math.max(0, x.qty + delta) } : x)),
      );
      const r = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, delta, reason }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        await refresh(); // roll back to server truth
        return { ok: false, error: d.error || "Could not adjust stock." };
      }
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const removeItem: InventoryCtx["removeItem"] = useCallback(
    async (id) => {
      setItems((p) => p.filter((x) => x.id !== id)); // optimistic
      await fetch(`/api/inventory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const lowStock = useMemo(
    () =>
      items
        .filter((i) => isLow(i.qty, i.reorder_at))
        .sort((a, b) => a.qty - a.reorder_at - (b.qty - b.reorder_at)),
    [items],
  );

  const stockValueCents = useMemo(
    () => items.reduce((sum, i) => sum + i.qty * i.cost_cents, 0),
    [items],
  );

  return (
    <Ctx.Provider
      value={{
        items,
        loading,
        error,
        lowStock,
        stockValueCents,
        refresh,
        addItem,
        updateItem,
        adjustQty,
        removeItem,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useInventory = () => useContext(Ctx);
