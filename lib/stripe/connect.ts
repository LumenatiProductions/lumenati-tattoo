import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, siteUrl } from "./client";

// Stripe Connect helpers (POS-STARTER-5). SERVER ONLY. Booth renters can be
// Express connected accounts; a renter's card ticket is a destination charge on
// the platform (the shop) with a 0 application fee — 100% lands in the renter's
// bank. Stripe pays them out and files their 1099. Payroll artists never route
// through Connect; their wages come from Gusto.

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

// Compute the destination-charge params for a TICKET payment, or null when it
// shouldn't route to the artist's bank. Only BOOTH RENTERS get destination
// charges: their card sales are 100% theirs (application fee 0 — rent is billed
// separately, never taken out of sales). Payroll artists' money stays in the
// shop account; Gusto pays their wages. Deposits stay on the platform — they
// may be forfeited to the shop, so they aren't transferred.
export async function connectChargeParams(
  admin: SupabaseClient,
  artistId: string | null,
  kind: string,
  _amountCents: number,
): Promise<{ destination: string; applicationFeeCents: number } | null> {
  if (kind !== "ticket" || !artistId) return null;
  const { data: a } = await admin
    .from("artists")
    .select("stripe_account_id, stripe_onboarded, pay_type")
    .eq("id", artistId)
    .maybeSingle();
  if (!a?.stripe_onboarded || !a.stripe_account_id) return null;
  if (a.pay_type !== "booth_rent") return null;

  return { destination: a.stripe_account_id, applicationFeeCents: 0 };
}
