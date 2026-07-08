import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "./appApi";
import { todayLocal } from "@/lib/dates";

// Merch at the register — state for the quick-tap shelf on the Take payment
// screen. Products are inventory items the desk gave a retail price (web
// Inventory page); prices here are display-only, the server re-prices every
// sale from the DB. Tax is added on top of shelf prices at the shop's rate.

export type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  qty: number;
  price_cents: number;
};

export type MerchTotals = {
  lines: { id: string; name: string; qty: number; price_cents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export function useMerch() {
  const [products, setProducts] = useState<Product[]>([]);
  const [taxBps, setTaxBps] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const r = await apiGet<{ items: Product[]; taxBps: number }>("/api/pos/products");
      if (r.ok && r.data) {
        setProducts(r.data.items ?? []);
        setTaxBps(r.data.taxBps ?? 0);
      }
    })();
  }, []);

  const add = useCallback((id: string) => {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  }, []);
  const remove = useCallback((id: string) => {
    setCart((c) => {
      const next = { ...c };
      if ((next[id] ?? 0) <= 1) delete next[id];
      else next[id] = next[id] - 1;
      return next;
    });
  }, []);
  const clear = useCallback(() => setCart({}), []);

  // Mirrors the server's math (round-half-up on the summed subtotal) so the
  // total on screen is the total that gets charged.
  const totals: MerchTotals | null = useMemo(() => {
    const lines = Object.entries(cart)
      .map(([id, qty]) => {
        const p = products.find((x) => x.id === id);
        return p ? { id, name: p.name, qty, price_cents: p.price_cents } : null;
      })
      .filter((l): l is NonNullable<typeof l> => !!l);
    if (lines.length === 0) return null;
    const subtotalCents = lines.reduce((s, l) => s + l.price_cents * l.qty, 0);
    const taxCents = Math.round((subtotalCents * taxBps) / 10000);
    return { lines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
  }, [cart, products, taxBps]);

  // The cash leg: server prices + books it (cash entry, ledger sale + tax
  // rows) and takes the stock down. Returns the server's total.
  const recordCash = useCallback(async (): Promise<{ ok: boolean; totalCents?: number; error?: string }> => {
    const items = Object.entries(cart).map(([id, qty]) => ({ id, qty }));
    if (items.length === 0) return { ok: false, error: "Nothing in the cart." };
    const r = await apiPost<{ totalCents: number }>("/api/pos/merch-sale", { items, date: todayLocal() });
    if (!r.ok || !r.data) return { ok: false, error: r.error || "Could not record the sale." };
    return { ok: true, totalCents: r.data.totalCents };
  }, [cart]);

  const cartItems = useMemo(() => Object.entries(cart).map(([id, qty]) => ({ id, qty })), [cart]);

  return { products, taxBps, cart, cartItems, add, remove, clear, totals, recordCash };
}
