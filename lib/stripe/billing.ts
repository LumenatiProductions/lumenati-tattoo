import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, siteUrl } from "./client";

// Subscription billing (2026-07-26). This is Lumenati's OWN revenue — the
// monthly software fee — separate from lib/stripe/connect.ts (the shop's card
// volume). Subscriptions charge the PLATFORM account's customers directly; no
// Connect involvement.
//
// Plans (confirmed pricing, /shops marketing page):
//   • artist    — $99/mo flat, a solo chair (shop with exactly one artist).
//   • shop      — $199/mo base + $79/mo per artist seat.
//   • founding  — $49/mo per seat, locked for life, capped at 100 seats total
//                 across all shops (the invite-phase hook).
// Every new shop gets a 30-day app-side trial (billing_status 'trial', no card,
// no Stripe object) stamped at creation; Stripe enters the picture at checkout.
// SERVER ONLY.

export const TRIAL_DAYS = 30;
export const FOUNDING_SEAT_CAP = 100;

// lookup_key -> amount. Lookup keys make prices find-or-create idempotent in
// BOTH test and live mode without hardcoding price ids per environment.
const PRICE_DEFS = {
  artist_flat: { lookupKey: "lumenati_artist_99", cents: 9900 },
  shop_base: { lookupKey: "lumenati_shop_base_199", cents: 19900 },
  shop_seat: { lookupKey: "lumenati_shop_seat_79", cents: 7900 },
  founding_seat: { lookupKey: "lumenati_founding_49", cents: 4900 },
} as const;
type PriceKey = keyof typeof PRICE_DEFS;

export type Plan = "artist" | "shop" | "founding";

// Statuses that keep the doors open. 'trial' is ours (pre-checkout clock, valid
// only until billing_period_end); the rest are Stripe's. past_due stays open —
// dunning retries are running and locking a shop mid-workday over a bounced
// card is hostile; Stripe flips it to canceled/unpaid if retries exhaust.
const OPEN_STATUSES = new Set(["trialing", "active", "past_due"]);

export type ShopBilling = {
  id: string;
  slug?: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_plan: string | null;
  billing_status: string | null;
  billing_seats: number | null;
  billing_period_end: string | null;
  billing_exempt: boolean;
};

export const SHOP_BILLING_COLS =
  "id, slug, stripe_customer_id, stripe_subscription_id, billing_plan, billing_status, billing_seats, billing_period_end, billing_exempt";

// Whether this shop's admin stays unlocked.
export function shopIsOpen(s: ShopBilling, now = new Date()): boolean {
  if (s.billing_exempt) return true;
  if (s.billing_status && OPEN_STATUSES.has(s.billing_status)) return true;
  if (s.billing_status === "trial" && s.billing_period_end) {
    return new Date(s.billing_period_end) > now;
  }
  return false;
}

// Days left on the app-side trial (null when not on trial). 0 = expired.
export function trialDaysLeft(s: ShopBilling, now = new Date()): number | null {
  if (s.billing_status !== "trial" || !s.billing_period_end) return null;
  const ms = new Date(s.billing_period_end).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ── Prices ───────────────────────────────────────────────────────────────────

let priceCache: Map<PriceKey, string> | null = null;

// Find-or-create the product + the four prices, keyed by lookup_key. Cached per
// server instance; runs against whichever mode the secret key is in, so test
// and live each grow their own copies on first use.
async function ensurePrices(): Promise<Map<PriceKey, string>> {
  if (!stripe) throw new Error("Stripe not configured");
  if (priceCache) return priceCache;

  const keys = Object.values(PRICE_DEFS).map((d) => d.lookupKey);
  const existing = await stripe.prices.list({ lookup_keys: keys, limit: 10 });
  const byLookup = new Map(existing.data.map((p) => [p.lookup_key as string, p.id]));

  let productId: string | null = existing.data[0]
    ? (existing.data[0].product as string)
    : null;

  const map = new Map<PriceKey, string>();
  for (const [key, def] of Object.entries(PRICE_DEFS) as [PriceKey, (typeof PRICE_DEFS)[PriceKey]][]) {
    const found = byLookup.get(def.lookupKey);
    if (found) {
      map.set(key, found);
      continue;
    }
    if (!productId) {
      const product = await stripe.products.create({
        name: "Lumenati membership",
        description: "Shop and artist software membership",
      });
      productId = product.id;
    }
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: def.cents,
      recurring: { interval: "month" },
      lookup_key: def.lookupKey,
      nickname: key,
    });
    map.set(key, price.id);
  }
  priceCache = map;
  return map;
}

// ── Customer ─────────────────────────────────────────────────────────────────

export async function ensureCustomer(
  admin: SupabaseClient,
  shop: { id: string; name?: string | null; stripe_customer_id: string | null },
  ownerEmail: string | null,
): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  if (shop.stripe_customer_id) return shop.stripe_customer_id;
  const customer = await stripe.customers.create({
    name: shop.name ?? undefined,
    email: ownerEmail ?? undefined,
    metadata: { shop_id: shop.id },
  });
  await admin.from("shops").update({ stripe_customer_id: customer.id }).eq("id", shop.id);
  return customer.id;
}

// ── Seats ────────────────────────────────────────────────────────────────────

export async function activeSeatCount(admin: SupabaseClient, shopId: string): Promise<number> {
  const { count } = await admin
    .from("artists")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("active", true);
  return Math.max(1, count ?? 1);
}

// Founding seats already claimed platform-wide (the 100-seat cap).
export async function foundingSeatsUsed(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from("shops")
    .select("billing_seats")
    .eq("billing_plan", "founding")
    .in("billing_status", ["trialing", "active", "past_due"]);
  return (data ?? []).reduce((n, r) => n + (r.billing_seats ?? 0), 0);
}

// Keep a seat-based subscription's quantity in step with the active roster.
// Called best-effort (billing page load + checkout); never throws.
export async function syncSeats(admin: SupabaseClient, shop: ShopBilling): Promise<void> {
  try {
    if (!stripe || !shop.stripe_subscription_id) return;
    if (shop.billing_plan !== "shop" && shop.billing_plan !== "founding") return;
    const seats = await activeSeatCount(admin, shop.id);
    if (seats === shop.billing_seats) return;

    const prices = await ensurePrices();
    const seatPriceId = prices.get(shop.billing_plan === "shop" ? "shop_seat" : "founding_seat");
    const sub = await stripe.subscriptions.retrieve(shop.stripe_subscription_id);
    const item = sub.items.data.find((i) => i.price.id === seatPriceId);
    if (!item || item.quantity === seats) return;
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, quantity: seats }],
      proration_behavior: "create_prorations",
    });
    await admin.from("shops").update({ billing_seats: seats }).eq("id", shop.id);
  } catch {
    // Roster drift self-heals on the next billing-page load.
  }
}

// ── Checkout + portal ────────────────────────────────────────────────────────

export async function subscriptionCheckoutUrl(
  admin: SupabaseClient,
  shop: ShopBilling & { name?: string | null },
  plan: Plan,
  ownerEmail: string | null,
): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  const prices = await ensurePrices();
  const seats = await activeSeatCount(admin, shop.id);

  // A multi-chair shop can't ride the solo plan.
  if (plan === "artist" && seats > 1) throw new Error("The Artist plan covers one chair. Pick the Shop plan.");
  if (plan === "founding") {
    const used = await foundingSeatsUsed(admin);
    if (used + seats > FOUNDING_SEAT_CAP) throw new Error("The Founding 100 is full.");
  }

  const line_items =
    plan === "artist"
      ? [{ price: prices.get("artist_flat")!, quantity: 1 }]
      : plan === "shop"
        ? [
            { price: prices.get("shop_base")!, quantity: 1 },
            { price: prices.get("shop_seat")!, quantity: seats },
          ]
        : [{ price: prices.get("founding_seat")!, quantity: seats }];

  const customerId = await ensureCustomer(admin, shop, ownerEmail);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items,
    allow_promotion_codes: true,
    subscription_data: { metadata: { shop_id: shop.id, plan } },
    metadata: { shop_id: shop.id, plan },
    success_url: `${siteUrl}/admin/billing?sub=success`,
    cancel_url: `${siteUrl}/admin/billing?sub=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout link");
  return session.url;
}

// Hosted customer portal (change card, see invoices, cancel). Test mode has no
// default portal configuration until one is saved in the dashboard, so
// find-or-create a minimal one.
let portalConfigId: string | null = null;

export async function portalUrl(customerId: string): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  if (!portalConfigId) {
    const configs = await stripe.billingPortal.configurations.list({ limit: 1 });
    if (configs.data[0]) {
      portalConfigId = configs.data[0].id;
    } else {
      const config = await stripe.billingPortal.configurations.create({
        business_profile: { headline: "Lumenati membership" },
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          customer_update: { enabled: true, allowed_updates: ["email", "address"] },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
        },
      });
      portalConfigId = config.id;
    }
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration: portalConfigId,
    return_url: `${siteUrl}/admin/billing`,
  });
  return session.url;
}

// ── Webhook write-back ───────────────────────────────────────────────────────

// Map a Stripe subscription onto the shop row. THE source of truth for billing
// state (renewals, card failures, cancels all land here). Idempotent.
export async function applySubscription(admin: SupabaseClient, sub: Stripe.Subscription): Promise<void> {
  const shopId = sub.metadata?.shop_id;

  const prices = new Map<string, string>();
  for (const item of sub.items.data) {
    if (item.price.lookup_key) prices.set(item.price.lookup_key, item.id);
  }
  const plan: Plan | null = prices.has(PRICE_DEFS.founding_seat.lookupKey)
    ? "founding"
    : prices.has(PRICE_DEFS.shop_base.lookupKey) || prices.has(PRICE_DEFS.shop_seat.lookupKey)
      ? "shop"
      : prices.has(PRICE_DEFS.artist_flat.lookupKey)
        ? "artist"
        : null;

  const seatItem = sub.items.data.find(
    (i) => i.price.lookup_key === PRICE_DEFS.shop_seat.lookupKey || i.price.lookup_key === PRICE_DEFS.founding_seat.lookupKey,
  );
  const seats = seatItem?.quantity ?? (plan === "artist" ? 1 : null);
  // API 2026-05-27: the period clock lives on the items, not the subscription.
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;

  const payload = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    billing_status: sub.status,
    billing_plan: plan,
    billing_seats: seats,
    billing_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };

  if (shopId) {
    await admin.from("shops").update(payload).eq("id", shopId);
  } else {
    // Older subs without metadata: match by the subscription id we stored.
    await admin.from("shops").update(payload).eq("stripe_subscription_id", sub.id);
  }
}
