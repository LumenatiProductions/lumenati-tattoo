import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, siteUrl } from "./client";
import { surchargeCents } from "./fees";

// Stripe Connect helpers (POS-STARTER-5, extended 2026-07-14 for payments).
// SERVER ONLY. Two kinds of connected account, both transfers-only Express (the
// PLATFORM creates the charge and transfers each party their money; no
// card_payments capability needed on the receiving account):
//   • BOOTH RENTER — a renter's card ticket is a destination charge to the
//     renter's own account. Stripe pays them out and files their 1099.
//   • SHOP — a payroll / shop-income ticket is a destination charge to the
//     SHOP's account, so each tenant's money lands in each tenant's balance
//     (never sits in Lumenati's). Wages still leave via Gusto.
// Either way the CLIENT pays service + tip + surcharge, the receiving account
// keeps 100% of service + tip, and Lumenati keeps the surcharge as the Stripe
// application fee (netting ~1% after Stripe's cut). Deposits stay on the
// platform (they may be forfeited to the shop, so they aren't transferred).

// ── Booth-renter (artist) account ────────────────────────────────────────────

// Create the Express account if the artist doesn't have one yet; store its id.
// Returns the account id (existing or new), or null if Stripe isn't configured.
export async function ensureAccount(
  admin: SupabaseClient,
  artist: { id: string; name: string; stripe_account_id: string | null },
): Promise<string | null> {
  if (!stripe) return null;
  if (artist.stripe_account_id) return artist.stripe_account_id;

  const account = await stripe.accounts.create({
    type: "express",
    business_type: "individual",
    // Transfer-only: the platform creates the charge; the artist just receives
    // their split. (No card_payments capability needed on the artist account.)
    capabilities: { transfers: { requested: true } },
    business_profile: { name: artist.name, product_description: "Tattoo services" },
    metadata: { artist_id: artist.id },
  });
  await admin.from("artists").update({ stripe_account_id: account.id }).eq("id", artist.id);
  return account.id;
}

// A hosted onboarding link (KYC + bank). The artist completes it once; on return
// we refresh their status. Links are short-lived, so we mint fresh each time.
export async function onboardingLink(accountId: string, artistId: string): Promise<string | null> {
  if (!stripe) return null;
  const base = `${siteUrl}/admin/payouts?connect=`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}refresh&artist=${artistId}`,
    return_url: `${base}return&artist=${artistId}`,
    type: "account_onboarding",
  });
  return link.url;
}

// Same hosted onboarding, but for the ARTIST doing it from the app: Stripe can
// only return to an https page (not a custom app scheme), so it lands on a small
// public "you're all set" page that tells them to head back to the app (which
// re-checks status on focus). Links are short-lived, so we mint fresh each time.
export async function onboardingLinkForApp(accountId: string, artistId: string): Promise<string | null> {
  if (!stripe) return null;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl}/bank-linked?state=refresh&artist=${artistId}`,
    return_url: `${siteUrl}/bank-linked?artist=${artistId}`,
    type: "account_onboarding",
  });
  return link.url;
}

// Re-read the account and persist whether it can actually receive transfers.
export async function refreshOnboardStatus(
  admin: SupabaseClient,
  artistId: string,
): Promise<{ onboarded: boolean; hasAccount: boolean }> {
  if (!stripe) return { onboarded: false, hasAccount: false };
  const { data: a } = await admin
    .from("artists")
    .select("stripe_account_id")
    .eq("id", artistId)
    .maybeSingle();
  if (!a?.stripe_account_id) return { onboarded: false, hasAccount: false };

  const acct = await stripe.accounts.retrieve(a.stripe_account_id);
  const onboarded = !!acct.charges_enabled && !!acct.details_submitted && !!acct.payouts_enabled;
  await admin.from("artists").update({ stripe_onboarded: onboarded }).eq("id", artistId);
  return { onboarded, hasAccount: true };
}

// ── Shop account ──────────────────────────────────────────────────────────────

// Create the shop's Express account if it doesn't have one yet; store its id.
// Same transfers-only shape as a renter — the platform charges, the shop
// receives its money as the destination. Returns the account id or null.
export async function ensureShopAccount(
  admin: SupabaseClient,
  shop: { id: string; name: string; stripe_account_id: string | null },
): Promise<string | null> {
  if (!stripe) return null;
  if (shop.stripe_account_id) return shop.stripe_account_id;

  const account = await stripe.accounts.create({
    type: "express",
    business_type: "company",
    capabilities: { transfers: { requested: true } },
    business_profile: { name: shop.name, product_description: "Tattoo studio" },
    metadata: { shop_id: shop.id },
  });
  await admin.from("shops").update({ stripe_account_id: account.id }).eq("id", shop.id);
  return account.id;
}

// Hosted onboarding link for the shop. Returns to /admin/payouts like the renter
// flow so the same status card can refresh both.
export async function shopOnboardingLink(accountId: string, shopId: string): Promise<string | null> {
  if (!stripe) return null;
  const base = `${siteUrl}/admin/payouts?connect=`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}refresh&shop=${shopId}`,
    return_url: `${base}return&shop=${shopId}`,
    type: "account_onboarding",
  });
  return link.url;
}

// Re-read the shop account and persist whether it can receive transfers.
export async function refreshShopOnboardStatus(
  admin: SupabaseClient,
  shopId: string,
): Promise<{ onboarded: boolean; hasAccount: boolean }> {
  if (!stripe) return { onboarded: false, hasAccount: false };
  const { data: s } = await admin
    .from("shops")
    .select("stripe_account_id")
    .eq("id", shopId)
    .maybeSingle();
  if (!s?.stripe_account_id) return { onboarded: false, hasAccount: false };

  const acct = await stripe.accounts.retrieve(s.stripe_account_id);
  const onboarded = !!acct.charges_enabled && !!acct.details_submitted && !!acct.payouts_enabled;
  await admin.from("shops").update({ stripe_onboarded: onboarded }).eq("id", shopId);
  return { onboarded, hasAccount: true };
}

// ── Charge routing ────────────────────────────────────────────────────────────

/**
 * Decide how a payment routes and what the client covers. Returns:
 *   • destination      — the connected account that receives service + tip
 *   • surchargeCents    — the card fee the CLIENT pays on top (added at checkout)
 *   • applicationFeeCents — Lumenati's Stripe application fee (== the surcharge)
 * ...or null to charge the platform directly with NO surcharge (deposits, and
 * the legacy single-shop fallback when nothing is onboarded yet).
 *
 * Routing for a ticket/other (a service payment on `base` = service + tip):
 *   • onboarded booth renter  -> the renter's account
 *   • else, onboarded shop     -> the shop's account (payroll / shop income)
 *   • neither onboarded         -> null (platform charge, no split, no surcharge)
 * Deposits and rent never split here (deposits may be forfeited; rent is a
 * separate in-house invoice).
 */
export async function connectChargeParams(
  admin: SupabaseClient,
  args: { shopId: string; artistId: string | null; kind: string; baseCents: number },
): Promise<{ destination: string; surchargeCents: number; applicationFeeCents: number } | null> {
  if (args.kind !== "ticket" && args.kind !== "other") return null;

  // Prefer routing a booth renter's sale straight to the renter.
  let destination: string | null = null;
  if (args.artistId) {
    const { data: a } = await admin
      .from("artists")
      .select("stripe_account_id, stripe_onboarded, pay_type")
      .eq("id", args.artistId)
      .maybeSingle();
    if (a?.pay_type === "booth_rent" && a.stripe_onboarded && a.stripe_account_id) {
      destination = a.stripe_account_id as string;
    }
  }

  // Otherwise the shop's own account catches payroll / shop-income sales.
  if (!destination) {
    const { data: s } = await admin
      .from("shops")
      .select("stripe_account_id, stripe_onboarded")
      .eq("id", args.shopId)
      .maybeSingle();
    if (s?.stripe_onboarded && s.stripe_account_id) destination = s.stripe_account_id as string;
  }

  if (!destination) return null; // nothing onboarded — charge the platform, no surcharge

  const surcharge = surchargeCents(args.baseCents);
  // The application fee IS the surcharge: the receiving account keeps service +
  // tip, Lumenati keeps the surcharge, Stripe's fee comes out of Lumenati's cut.
  return { destination, surchargeCents: surcharge, applicationFeeCents: surcharge };
}
