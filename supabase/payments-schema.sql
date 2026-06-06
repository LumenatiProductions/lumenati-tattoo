-- Lumenati — Payments schema (Stripe-backed deposits + tickets)
-- Run in the Supabase SQL editor after bookings-schema.sql + square-schema.sql
-- (needs my_role()). See POS-STARTER-1-STRIPE-PAYMENTS.md.
--
-- The money rail under the deposit fields that already exist on `bookings`. A row
-- is created when staff (or the kiosk) generates a pay link; Stripe's webhook
-- flips it to `paid` and cascades the booking. We never store card data — Stripe
-- hosts the card field; we only keep the session/intent ids for reconciliation.

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    text references public.bookings(id) on delete set null,
  client_id     text references public.clients(id) on delete set null,
  artist_id     text references public.artists(id) on delete set null,
  kind          text not null default 'deposit',   -- deposit | ticket | other
  amount_cents  integer not null,
  currency      text not null default 'usd',
  status        text not null default 'pending',    -- pending | paid | refunded | failed | canceled
  stripe_session_id        text,                     -- Checkout Session id
  stripe_payment_intent_id text,                     -- the PI, for refunds / reconciliation
  pay_token     text unique,                         -- opaque token in the public /pay URL
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create index if not exists payments_booking_idx on public.payments (booking_id);
create index if not exists payments_status_idx  on public.payments (status);
create unique index if not exists payments_session_idx
  on public.payments (stripe_session_id) where stripe_session_id is not null;

-- ── RLS ──
-- Front-of-house + bookkeeping manage payments. The webhook writes via the
-- service-role client (bypasses RLS). The public /pay/[token] page reads its one
-- row through a service-role server route, never via client RLS, so no public
-- read policy is granted here.
alter table public.payments enable row level security;

drop policy if exists payments_staff_read on public.payments;
create policy payments_staff_read on public.payments for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists payments_staff_write on public.payments;
create policy payments_staff_write on public.payments for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));
