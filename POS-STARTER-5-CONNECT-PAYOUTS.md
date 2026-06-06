# POS Starter 5: Stripe Connect auto-payouts

Read `POS-BUILD-PLAN.md` first. Depends on Session 1 (payments rail). This is the
big automation: it deletes the manual "Mark settled" dance and makes the
artist's split land in their bank automatically.

## The idea in one line

Each artist is a Stripe Connect account; when a client pays, Stripe splits the
artist's share to them and keeps the shop's cut in the same transaction, and
files the artist's 1099.

## What exists to build on

`artists.pay` already encodes split/rent/hybrid and `calc.ts` already computes the
shop cut per ticket, so the split math is solved. Session 1's `payments` table and
webhook are the rail. This session points that rail at connected accounts.

## Data model (columns on `artists`, no new table)

```
alter table public.artists add column stripe_account_id text;       -- Connect Express acct
alter table public.artists add column stripe_onboarded  boolean default false;
```

## Owned files

`app/api/connect/route.ts` (create account + onboarding link; refresh status) ·
`lib/stripe/connect.ts` (account create, account-link, split-charge helper) ·
edits to `lib/stripe/payments.ts` create-session to add
`payment_intent_data.application_fee_amount` (shop cut) +
`transfer_data.destination` (artist account) when the artist is onboarded ·
the Payouts page is rewritten from "mark settled" to "auto-settled by Stripe".

## Flow

1. Owner sends each artist an onboarding link; artist completes Stripe Express KYC
   once; `stripe_onboarded=true`.
2. From then on, a ticket payment for that artist uses a destination charge:
   shop is the platform, `application_fee_amount` = the shop's cut from `calc.ts`,
   the rest transfers to the artist. Cash-collected tickets still settle the old way.
3. Stripe pays the artist out to their bank on its schedule and files their 1099.
   Payouts page shows status, not a manual button.

## Phases

1. Connect onboarding (account + link + status), test mode, one artist.
2. Destination charges on card tickets for onboarded artists; fall back to current
   behavior for the rest (mixed roster is fine).
3. Rewrite Payouts to reflect auto-settlement + show Stripe payout status.
4. Tips and refunds across the split; edge cases (partial refund, dispute).

## External needs from Scott

Stripe Connect enabled on the account; the OK to onboard real artists (KYC); a
decision on who absorbs Stripe fees (shop vs artist).

## STATUS — built (2026-06-05), awaiting Stripe keys + Connect

Phases 1–3 shipped. Dormant until Scott adds Stripe keys AND enables Connect on
the account; until then the Payouts page shows a "add Stripe keys" note and the
manual settlement view still works unchanged.

- `supabase/connect-schema.sql` — APPLIED: `artists.stripe_account_id` +
  `stripe_onboarded` (additive; append-only, doesn't edit artists-schema.sql).
- `lib/stripe/connect.ts` — `ensureAccount` (create Express transfer-only acct +
  store id), `onboardingLink` (hosted KYC link), `refreshOnboardStatus` (persist
  charges/details/payouts enabled), and `connectChargeParams` (the split:
  application fee = shop cut from `split_pct`, 0 for rent artists; **tickets only**
  — deposits stay on the platform since they may be forfeited to the shop).
- `lib/stripe/payments.ts` — `startCheckout` now adds `application_fee_amount` +
  `transfer_data.destination` for a ticket whose artist is onboarded. Deposits
  and non-onboarded artists charge the platform as before.
- `app/api/connect/route.ts` — owner-gated: GET roster + status, POST
  onboard/refresh.
- `components/admin/connect/PayoutsConnect.tsx` + Payouts page — owner sees a
  Connect setup panel (onboard / finish / refresh per artist, status badges);
  auto-rechecks on return from Stripe (`?connect=return`).
- `npm run build` green (Stripe destination-charge types validated).

**Not yet:** Phase 4 (tips split — today the whole ticket amount is split by the
artist's `split_pct`; tips should stay 100% with the artist; refunds/disputes
across the split). Fees: destination charges currently leave Stripe fees with the
platform (shop) by default — Scott to decide if artists absorb them.

### Aimed at Session 6 (Tap to Pay)
In-person taps must create the SAME destination-charge PaymentIntent. Reuse
`connectChargeParams` server-side: the phone app collects the card via Tap to Pay
and confirms a PaymentIntent built with `application_fee_amount` +
`transfer_data.destination` exactly as `startCheckout` does. Add a thin
`/api/terminal/...` endpoint that mints that PaymentIntent for a booking/ticket;
do NOT recompute the split in the app.
