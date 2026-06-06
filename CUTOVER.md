# Cutover: retiring Square + QuickBooks

The plan to move off the two outside subscriptions onto the owned stack. Nothing
here is irreversible until the final step — run it when you're ready, not before.

## Where the books now live (no QuickBooks needed)

- **Income** — Stripe (every charge, fee, refund, payout) + `sales`. The Stripe
  ledger on **Expenses & Books** lists it; Reports rolls it up.
- **Artist payouts** — Stripe Connect splits them automatically (Session 5); the
  Payouts page + Stripe show the record.
- **Shop expenses** — the new `expenses` table (supplies, rent, utilities, etc.),
  added on the Expenses & Books page, with receipt-snap from the app feeding it.
- **1099s** — Stripe files them for Connect-onboarded artists; Reports has the
  per-contractor view as a cross-check.
- **The accountant hand-off** — the CSV exports on Reports (per-artist + 1099),
  Expenses (shop expenses), and the Stripe ledger together replace the QBO export.

## Retiring QuickBooks (do first — lowest risk)

1. Log expenses into Expenses & Books for one full period alongside QBO.
2. Export the three CSVs + pull Reports for the same period.
3. Give your accountant the exports and confirm they accept them in place of QBO.
4. Once confirmed, stop new entry in QuickBooks. Keep the QBO account read-only
   for historical records until year-end is filed, then cancel.

## Retiring Square (do after payments are live)

Prerequisite: Stripe keys set, Connect live, artists onboarded (Sessions 1 + 5),
and either Tap to Pay on artist phones (6c) or the kiosk/pay-link flow in use.

1. Run Stripe in parallel with Square for a week — take some tickets on each.
2. Reconcile: confirm the Stripe ledger + payouts match what hit the bank.
3. Pick a stop date. Announce it to the artists.
4. On the stop date: stop taking new Square payments; switch fully to Stripe.
5. Let any open Square deposits/refunds settle, pull the final Square report for
   the accountant, then close the Square account.

## Rollback

Until the Square account is closed and QBO is cancelled, both still work — if
anything looks off in the owned stack, keep using them and tell me what's wrong.
