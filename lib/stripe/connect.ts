import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, siteUrl } from "./client";

// Stripe Connect helpers (POS-STARTER-5). SERVER ONLY. Each artist is an Express
// connected account; a card ticket is a destination charge on the platform (the
// shop), with the shop's cut kept as the application fee and the remainder
// transferred to the artist. Stripe pays the artist out and files their 1099.

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

// Compute the destination-charge params for a TICKET payment, or null when the
// artist isn't on Connect / the payment isn't splittable (deposits stay on the
// platform — they may be forfeited to the shop, so they aren't transferred).
// Shop cut = the artist's split (rent artists keep 100% of tickets; the shop is
// paid via rent separately, so the application fee is 0).
export async function connectChargeParams(
  admin: SupabaseClient,
  artistId: string | null,
  kind: string,
  amountCents: number,
): Promise<{ destination: string; applicationFeeCents: number } | null> {
  if (kind !== "ticket" || !artistId) return null;
  const { data: a } = await admin
    .from("artists")
    .select("stripe_account_id, stripe_onboarded, pay_type, split_pct")
    .eq("id", artistId)
    .maybeSingle();
  if (!a?.stripe_onboarded || !a.stripe_account_id) return null;

  const split = a.pay_type === "rent" ? 0 : Number(a.split_pct) || 0;
  const applicationFeeCents = Math.min(amountCents, Math.max(0, Math.round(amountCents * split)));
  return { destination: a.stripe_account_id, applicationFeeCents };
}
