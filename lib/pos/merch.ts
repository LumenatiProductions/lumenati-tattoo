import type { SupabaseClient } from "@supabase/supabase-js";

// Merch at the register. SERVER ONLY — the phone POS and the web cash page both
// send [{id, qty}] and the price of every line comes from the DB, never the
// client. Tax is ADDED on top of the shelf price (rate = shops.sales_tax_bps),
// matching the ledger's shape: the sale row is net of tax, the tax row is the
// state's money. See supabase/2026-07-05-merch-pos.sql.

const SHOP_ID = "11111111-1111-1111-1111-111111111111";

export type CartLine = {
  id: string;
  name: string;
  qty: number;
  price_cents: number; // per unit, shelf price
};

export type PricedCart = {
  lines: CartLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxBps: number;
};

/** Items with a retail price are the sellable catalog. */
export async function sellableItems(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("inventory_items")
    .select("id, name, brand, category, qty, price_cents")
    .not("price_cents", "is", null)
    .gt("price_cents", 0)
    .order("category")
    .order("name");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, items: data ?? [] };
}

export async function taxBps(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("shops").select("sales_tax_bps").eq("id", SHOP_ID).maybeSingle();
  const bps = Number(data?.sales_tax_bps ?? 0);
  return Number.isFinite(bps) && bps > 0 ? Math.round(bps) : 0;
}

/**
 * Price a cart server-side: [{id, qty}] -> lines at DB prices + tax at the
 * shop's rate. Rejects unknown items, cleared prices, and junk quantities.
 */
export async function priceCart(
  admin: SupabaseClient,
  items: { id?: string; qty?: number }[],
): Promise<{ ok: true; cart: PricedCart } | { ok: false; error: string }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Nothing in the cart." };
  }
  if (items.length > 50) return { ok: false, error: "That's too many line items." };

  // Collapse duplicate taps into one line per item.
  const want = new Map<string, number>();
  for (const it of items) {
    const id = (it.id ?? "").toString();
    const qty = Math.round(Number(it.qty));
    if (!id || !Number.isFinite(qty) || qty <= 0 || qty > 999) {
      return { ok: false, error: "Bad cart line." };
    }
    want.set(id, (want.get(id) ?? 0) + qty);
  }

  const { data, error } = await admin
    .from("inventory_items")
    .select("id, name, price_cents")
    .in("id", [...want.keys()]);
  if (error) return { ok: false, error: error.message };

  const lines: CartLine[] = [];
  for (const [id, qty] of want) {
    const row = (data ?? []).find((r) => r.id === id);
    const price = Math.round(Number(row?.price_cents ?? 0));
    if (!row || price <= 0) return { ok: false, error: "An item in the cart isn't for sale anymore." };
    lines.push({ id, name: row.name as string, qty, price_cents: price });
  }

  const subtotalCents = lines.reduce((s, l) => s + l.price_cents * l.qty, 0);
  const bps = await taxBps(admin);
  const taxCents = Math.round((subtotalCents * bps) / 10000);
  return {
    ok: true,
    cart: { lines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents, taxBps: bps },
  };
}

/**
 * Take sold quantities out of stock, with an inventory_log row per line so the
 * audit trail says what left and why. Clamped at zero like the page's +/- —
 * an oversell means the count was wrong, and the log still shows the sale.
 * Best-effort: a stock hiccup must never bounce a payment that already settled.
 */
export async function decrementStock(admin: SupabaseClient, lines: CartLine[], byEmail: string | null) {
  for (const l of lines) {
    const { data: cur } = await admin.from("inventory_items").select("qty").eq("id", l.id).maybeSingle();
    if (!cur) continue;
    await admin
      .from("inventory_items")
      .update({ qty: Math.max(0, Number(cur.qty) - l.qty), updated_at: new Date().toISOString() })
      .eq("id", l.id);
    await admin.from("inventory_log").insert({
      item_id: l.id,
      delta: -l.qty,
      reason: "sold at the register",
      by_email: byEmail,
    });
  }
}
