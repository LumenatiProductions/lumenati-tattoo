# POS Starter 1: Stripe foundation + client payment portal

Read `POS-BUILD-PLAN.md` first. This is the cornerstone: every other POS session
imports what this one settles. Pure web, test mode, no native, no Connect yet.

## The idea in one line

A client gets a link or QR code, pays their deposit (or final ticket) from their
own phone on a Stripe-hosted page, and the booking updates itself, with the
payment recorded in a `payments` table we own.

## What exists to build on

`bookings` already models the deposit lifecycle (`deposit_cents`,
`deposit_status` none/held/applied/forfeited/refunded). Auth/RLS/`my_role()`
patterns per `BUILD-PLAN.md`. Resend for any receipt/confirmation email. We are
adding the money rail under the deposit fields that already exist.

## Data model (one new owned table)

```
payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    text references public.bookings(id) on delete set null,
  client_id     text references public.clients(id) on delete set null,
  artist_id     text references public.artists(id) on delete set null,
  kind          text not null default 'deposit',   -- deposit | ticket | other
  amount_cents  integer not null,
  currency      text not null default 'usd',
  status        text not null default 'pending',    -- pending | paid | refunded | failed | canceled
  stripe_session_id        text,                     -- Checkout Session id
  stripe_payment_intent_id text,                     -- the PI, for refunds/reconciliation
  pay_token     text unique,                         -- opaque token in the public /pay URL
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
)
```
RLS: owner/bookkeeper/frontdesk read+write. The webhook writes via the
service-role client (bypasses RLS). The public `/pay/[token]` route reads a single
row by `pay_token` through a server action / gated API, never via client RLS.

## Owned files

`lib/stripe/client.ts` (server Stripe SDK singleton + `isStripeConfigured`) ·
`lib/stripe/payments.ts` (create-session, mark-paid, refund helpers) ·
`app/api/payments/route.ts` (staff: create a pay link for a booking; list) ·
`app/api/stripe/webhook/route.ts` (signature-verified, idempotent state writer) ·
`app/pay/[token]/page.tsx` (public, mobile-first payment portal) ·
`supabase/payments-schema.sql` · `.env.local.example` Stripe keys (commented).

Do not edit another feature's files. `lib/stripe/*` is settled here and imported
read-only by Sessions 2, 5, 6, 7.

## Flow

1. Staff (or later the kiosk) calls `POST /api/payments` with `{bookingId, kind,
   amountCents}`. Server creates a Stripe Checkout Session (mode `payment`) and a
   `payments` row (`status=pending`, a random `pay_token`), returns the hosted
   URL + a QR.
2. Client opens `/pay/[token]` on their phone (or is redirected to Checkout). They
   pay on Stripe's page. No card data ever hits our origin.
3. Stripe fires `checkout.session.completed` -> our webhook verifies the
   signature, finds the row by `stripe_session_id`, sets `status=paid`,
   `paid_at`, and cascades the booking: deposit -> `held`; ticket -> records the
   sale. Idempotent on event id so retries are safe.
4. The portal's success state reads the row; if the tab closed, the webhook still
   settled it. Webhook is truth, redirect is convenience.

## Page sketch (the portal)

Lumenati-branded, single purpose: artist + service + amount, one "Pay $X"
button, Apple Pay / Google Pay surfaced by Checkout automatically. Success and
already-paid states. Expired/invalid token state. Nothing else on the page.

## Phases

1. Schema + Stripe client + create-session API + `/pay/[token]` + webhook for
   deposits. Test-mode end to end with the Stripe CLI.
2. Ticket (final payment) kind; receipt email via Resend.
3. Refund helper + `refunded` status (owner-only).
4. A "Send pay link" button on the booking row (sets up the kiosk + Connect reuse).

## External needs from Scott

A Stripe account and **test** keys to start (`STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). The `STRIPE_WEBHOOK_SECRET` comes from the
Stripe CLI locally / the dashboard in prod. Live keys + business verification are
NOT needed until we intentionally go live.

## STATUS

Not started. Aim Session 2 (kiosk) here once `/pay/[token]` + the webhook are
green in test mode, since the kiosk's "pay deposit" step just reuses
`POST /api/payments`.
