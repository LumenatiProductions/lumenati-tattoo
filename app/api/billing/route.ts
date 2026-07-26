import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  SHOP_BILLING_COLS,
  type ShopBilling,
  type Plan,
  shopIsOpen,
  trialDaysLeft,
  activeSeatCount,
  foundingSeatsUsed,
  FOUNDING_SEAT_CAP,
  syncSeats,
  subscriptionCheckoutUrl,
  portalUrl,
} from "@/lib/stripe/billing";

export const dynamic = "force-dynamic";

// The shop's membership (Lumenati's own subscription revenue). Owners only —
// artists never see the shop's bill. Billing columns are server-only (no client
// grants), so everything rides the service-role client, scoped to ctx.shopId.

async function loadShop(shopId: string) {
  const admin = createAdminClient();
  if (!admin) return { admin: null, shop: null };
  const { data } = await admin
    .from("shops")
    .select(`${SHOP_BILLING_COLS}, name`)
    .eq("id", shopId)
    .maybeSingle();
  return { admin, shop: data as (ShopBilling & { name: string | null }) | null };
}

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const { admin, shop } = await loadShop(ctx.shopId);
  if (!admin || !shop) return NextResponse.json({ error: "Shop not found" }, { status: 500 });

  // Roster changes since the last visit catch up here (best-effort).
  await syncSeats(admin, shop);

  const seats = await activeSeatCount(admin, shop.id);
  const foundingLeft = Math.max(0, FOUNDING_SEAT_CAP - (await foundingSeatsUsed(admin)));
  return NextResponse.json({
    configured: isStripeConfigured,
    exempt: shop.billing_exempt,
    open: shopIsOpen(shop),
    plan: shop.billing_plan,
    status: shop.billing_status,
    seats,
    billedSeats: shop.billing_seats,
    periodEnd: shop.billing_period_end,
    trialDaysLeft: trialDaysLeft(shop),
    foundingLeft,
    hasSubscription: !!shop.stripe_subscription_id,
  });
}

export async function POST(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });
  if (!isStripeConfigured) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { action?: string; plan?: string };
  const { admin, shop } = await loadShop(ctx.shopId);
  if (!admin || !shop) return NextResponse.json({ error: "Shop not found" }, { status: 500 });

  try {
    if (b.action === "portal") {
      if (!shop.stripe_customer_id) return NextResponse.json({ error: "No billing account yet" }, { status: 400 });
      return NextResponse.json({ url: await portalUrl(shop.stripe_customer_id) });
    }
    if (b.action === "checkout") {
      const plan = (["artist", "shop", "founding"] as Plan[]).find((p) => p === b.plan);
      if (!plan) return NextResponse.json({ error: "Pick a plan" }, { status: 400 });
      if (shop.stripe_subscription_id && shop.billing_status !== "canceled") {
        return NextResponse.json({ error: "Already subscribed — use Manage billing" }, { status: 409 });
      }
      const url = await subscriptionCheckoutUrl(admin, shop, plan, ctx.email);
      return NextResponse.json({ url });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Billing error" },
      { status: 400 },
    );
  }
}
