// THE renter rule, shared by every surface that says "pass-through" (Reports,
// Pay, Overview, P&L). One definition so the same shop never reads two numbers.
//
// A booth renter keeps 100% of their sales. The only part the SHOP ever touches
// is what its card reader collected: that money sits in the shop's Stripe
// balance until it's handed over, so it is "pass-through" (visible flow, never
// income). Cash a renter takes at the chair never touches the shop at all, so
// it is neither collected nor pass-through; it's simply theirs.

export const RENTER_PASS_THROUGH_NOTE =
  "Renters' card sales the shop's reader collected and is holding for them. Cash a renter takes at the chair never touches the shop, so it is never pass-through.";

/** Split one renter sale into what the shop holds vs what never came through. */
export function renterSplit(cents: number, isCash: boolean): { passThrough: number; renterCash: number } {
  return isCash ? { passThrough: 0, renterCash: cents } : { passThrough: cents, renterCash: 0 };
}

export const isCashSource = (source: string | null | undefined, method?: string | null) =>
  source === "cash" || method === "cash";
