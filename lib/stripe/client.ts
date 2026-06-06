import Stripe from "stripe";

// Server-only Stripe SDK singleton. SERVER ONLY — never import into client code
// (it carries the secret key). Settled here in POS-STARTER-1 and imported
// read-only by later POS sessions; do not re-instantiate elsewhere.
//
// Test keys first (POS-BUILD-PLAN: test mode until Scott flips live keys). Until
// STRIPE_SECRET_KEY is set, `stripe` is null and the payment routes report a
// clean "not configured" instead of throwing — the rest of the app is unaffected.

const KEY = process.env.STRIPE_SECRET_KEY;

export const isStripeConfigured = Boolean(KEY);

export const stripe: Stripe | null = KEY
  ? new Stripe(KEY, { appInfo: { name: "Lumenati POS" } })
  : null;

// The public base URL Stripe redirects back to (success/cancel). Falls back to
// localhost for dev. Set NEXT_PUBLIC_SITE_URL in prod for correct return links.
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");
