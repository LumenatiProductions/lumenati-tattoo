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

## STATUS

Not started. Aim Session 6 (Tap to Pay) here: in-person taps should create the
SAME destination-charge PaymentIntent this session builds, so the phone app reuses
this split logic rather than reinventing it.
