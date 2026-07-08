# Overnight bug hunt — 2026-07-08 night

(Summary gets written here when the run ends.)

## Fixed

- **Unpaid rent from past months was invisible to the admin.** The Booth Rent
  page's in-house list only showed the current month, so June's three unpaid
  invoices ($2,800 across Elaine, Sam, ShorTy) could never be chased from the
  web. Now every unpaid invoice stays visible with a PAST MONTH tag until it's
  paid; each row shows its own month instead of assuming the current one. Also
  fixed stale "rent/hybrid artist" wording to "booth renter".
  Verified: all 6 unpaid rows render in Chrome (June tagged PAST MONTH),
  tsc both sides clean, 20/20 tests. Commit: (this one).

## Needs Scott

- (nothing yet)

## Checked clean

- Old pay-model vocabulary sweep: no leftover 'rent'/'split'/'hybrid' pay-type
  branches, no "Payouts owed"/"settle up"/"cash out" copy anywhere in web or
  app code. The two-shop test script inherits the new pay-type default safely.
- Rent invoice generation on the live DB made invoices for exactly the three
  booth renters (June + July), nobody else.
