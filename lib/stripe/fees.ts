// Lumenati fee math — the client covers the card fee (surcharge), Lumenati keeps
// a thin slice. Pure functions, no Stripe import, so this is safe to use on BOTH
// the server (authoritative charge) and the client (the /pay quote the payer
// sees). Keep it that way — never import the SDK here.
//
// HOW THE MONEY WORKS (destination charge):
//   client is charged:  service + tip + surcharge
//   connected account (artist or shop) receives:  service + tip   (100% of theirs)
//   Lumenati (platform) receives as application fee:  surcharge
//   Stripe deducts its processing fee from Lumenati's portion, so Lumenati nets
//   roughly surcharge - Stripe's fee ≈ ~1% of card volume.
// That's why the application fee == the surcharge, and the surcharge is sized to
// Stripe's cost + ~1%.
//
// Scott set these 2026-07-14: a clean flat 3.9%, no fixed cents (no ugly "+30c"
// on the receipt). That covers Stripe either way — in-person Tap to Pay is
// 2.7% + ~15c, an online pay link is 2.9% + 30c — and leaves Lumenati ~1% on
// top. The extra ~1% over Stripe's raw rate is a real cost of acceptance to the
// shop (it's what the shop pays Lumenati to run payments), so passing it through
// stays within the card-network/state surcharge rules. Don't pad it further to
// skim more — that IS the ceiling; extra margin comes from get-paid-early below.
export const SURCHARGE = {
  /** % of (service + tip). Flat, no fixed component. */
  pct: 0.039,
  /** No flat cents — Scott wanted a clean round percentage on the receipt. */
  fixedCents: 0,
  /** Hard ceiling as a % of (service + tip) — a guardrail so the surcharge can
   *  never exceed the shop's real cost of acceptance if pct is ever nudged. */
  capPct: 0.04,
} as const;

/** The card fee the client covers, in cents, computed off the service+tip base.
 *  Always <= base * capPct. Returns 0 for a non-positive base. */
export function surchargeCents(baseCents: number): number {
  if (!Number.isFinite(baseCents) || baseCents <= 0) return 0;
  const raw = Math.round(baseCents * SURCHARGE.pct) + SURCHARGE.fixedCents;
  const cap = Math.round(baseCents * SURCHARGE.capPct);
  return Math.min(raw, cap);
}

// Get-paid-early: an opt-in instant payout of a renter's already-settled funds.
// Scott set 1.5% (2026-07-14). Note the renter also pays Stripe's own instant-
// payout fee out of their balance when the payout fires, so Lumenati's 1.5% here
// is pure margin on top. This is a SERVICE fee, not a surcharge, so it isn't
// bound by the surcharge cap.
export const INSTANT_PAYOUT = {
  /** Lumenati's % of the amount paid out early. */
  pct: 0.015,
  /** Floor in cents, so a tiny early payout still earns something. */
  minCents: 50,
} as const;

/** Lumenati's fee for paying a renter early, in cents, off the payout amount. */
export function instantPayoutFeeCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.max(INSTANT_PAYOUT.minCents, Math.round(amountCents * INSTANT_PAYOUT.pct));
}
