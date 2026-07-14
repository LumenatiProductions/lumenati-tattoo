import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  ensureAccount,
  onboardingLink,
  onboardingLinkForApp,
  refreshOnboardStatus,
  ensureShopAccount,
  shopOnboardingLink,
  refreshShopOnboardStatus,
} from "@/lib/stripe/connect";

export const dynamic = "force-dynamic";

// Connect onboarding. Cookie-or-Bearer (resolveStaff): the OWNER manages every
// renter + the shop account from the web admin; an ARTIST links their OWN bank
// from the app (booth renters only — payroll artists are paid via Gusto).
// Reads/writes the Connect columns via the service-role client; Stripe calls go
// through the server SDK.

// Status. Owner -> the roster + shop account; artist -> just their own bank link.
export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { role, shopId, artistId } = ctx;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  // An artist sees only their own status. `eligible` = a booth renter (the only
  // artists who link a bank); the app hides the button otherwise.
  if (role === "artist") {
    if (!artistId) return NextResponse.json({ configured: isStripeConfigured, me: null });
    const { data: a } = await admin
      .from("artists")
      .select("pay_type, stripe_account_id, stripe_onboarded")
      .eq("id", artistId)
      .eq("shop_id", shopId)
      .maybeSingle();
    return NextResponse.json({
      configured: isStripeConfigured,
      me: a
        ? {
            eligible: a.pay_type === "booth_rent",
            hasAccount: !!a.stripe_account_id,
            onboarded: !!a.stripe_onboarded,
          }
        : null,
    });
  }

  if (role !== "owner" || !shopId) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  // Only booth renters get their OWN Connect account — payroll artists are paid
  // via Gusto and route through the shop's account instead.
  const { data, error } = await admin
    .from("artists")
    .select("id, name, stripe_account_id, stripe_onboarded")
    .eq("shop_id", shopId)
    .eq("active", true)
    .eq("pay_type", "booth_rent")
    .order("sort");
  if (error) return NextResponse.json({ error: error.message, artists: [] }, { status: 500 });

  // The SHOP's own account catches payroll / shop-income card sales. Reading via
  // service role (bypasses the per-column grants on `shops`).
  const { data: s } = await admin
    .from("shops")
    .select("stripe_account_id, stripe_onboarded")
    .eq("id", shopId)
    .maybeSingle();

  return NextResponse.json({
    configured: isStripeConfigured,
    shop: { hasAccount: !!s?.stripe_account_id, onboarded: !!s?.stripe_onboarded },
    artists: (data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      hasAccount: !!a.stripe_account_id,
      onboarded: !!a.stripe_onboarded,
    })),
  });
}

// POST { action: "onboard" | "refresh", target?, artistId? }.
//  - onboard: create the Express account if needed, return a hosted onboarding URL
//  - refresh: re-read the account and persist whether it can receive transfers
// Owner may target the shop or any renter; an artist only ever acts on themselves.
export async function POST(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStripeConfigured) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 503 });
  }
  const { role, shopId, artistId: myArtistId } = ctx;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as {
    artistId?: string;
    action?: string;
    target?: "shop" | "artist";
  };

  // ARTIST links their OWN bank from the app. Any artistId/target in the body is
  // ignored — they can only ever act on their own chair, and only as a renter.
  if (role === "artist") {
    if (!myArtistId) return NextResponse.json({ error: "No chair linked to your account." }, { status: 403 });
    const { data: me } = await admin
      .from("artists")
      .select("id, name, stripe_account_id, pay_type")
      .eq("id", myArtistId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (!me) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    if (me.pay_type !== "booth_rent") {
      return NextResponse.json(
        { error: "Your pay is run through the shop — no bank link needed." },
        { status: 400 },
      );
    }
    if (b.action === "refresh") {
      return NextResponse.json(await refreshOnboardStatus(admin, myArtistId));
    }
    try {
      const accountId = await ensureAccount(admin, me);
      if (!accountId) return NextResponse.json({ error: "Could not create account." }, { status: 502 });
      const url = await onboardingLinkForApp(accountId, me.id);
      if (!url) return NextResponse.json({ error: "Could not create link." }, { status: 502 });
      return NextResponse.json({ url });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error." }, { status: 502 });
    }
  }

  if (role !== "owner" || !shopId) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  // Shop-level onboarding (no artistId): stand up the SHOP's connected account so
  // payroll / shop-income card sales land in the shop's balance, not Lumenati's.
  if (b.target === "shop") {
    if (b.action === "refresh") {
      const status = await refreshShopOnboardStatus(admin, shopId);
      return NextResponse.json(status);
    }
    const { data: shop } = await admin
      .from("shops")
      .select("id, name, stripe_account_id")
      .eq("id", shopId)
      .maybeSingle();
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    try {
      const accountId = await ensureShopAccount(admin, {
        id: shop.id as string,
        name: (shop.name as string) ?? "Lumenati Tattoo",
        stripe_account_id: (shop.stripe_account_id as string | null) ?? null,
      });
      if (!accountId) return NextResponse.json({ error: "Could not create account." }, { status: 502 });
      const url = await shopOnboardingLink(accountId, shopId);
      if (!url) return NextResponse.json({ error: "Could not create link." }, { status: 502 });
      return NextResponse.json({ url });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Stripe error." },
        { status: 502 },
      );
    }
  }

  if (!b.artistId) return NextResponse.json({ error: "Missing artistId" }, { status: 400 });

  // The artist must belong to the owner's shop before any Stripe call or update.
  const { data: artist } = await admin
    .from("artists")
    .select("id, name, stripe_account_id, pay_type")
    .eq("id", b.artistId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  if (artist.pay_type !== "booth_rent") {
    return NextResponse.json(
      { error: "Only booth renters get bank links — payroll artists are paid via Gusto." },
      { status: 400 },
    );
  }

  if (b.action === "refresh") {
    const status = await refreshOnboardStatus(admin, b.artistId);
    return NextResponse.json(status);
  }

  // default: onboard

  try {
    const accountId = await ensureAccount(admin, artist);
    if (!accountId) return NextResponse.json({ error: "Could not create account." }, { status: 502 });
    const url = await onboardingLink(accountId, artist.id);
    if (!url) return NextResponse.json({ error: "Could not create link." }, { status: 502 });
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stripe error." },
      { status: 502 },
    );
  }
}
