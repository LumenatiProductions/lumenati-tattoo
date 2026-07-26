-- Subscription billing (2026-07-26). SaaS revenue lands here: every shop
-- carries its Stripe Billing state. SERVER-ONLY columns — shops has per-column
-- grants, so adding columns with NO grants keeps them invisible to both anon
-- and authenticated clients; only service-role API routes read/write them.
--
-- billing_status values: 'trial' (app-side 30-day clock, no Stripe sub yet),
-- then Stripe's own lifecycle ('trialing','active','past_due','canceled',
-- 'unpaid','incomplete','incomplete_expired') once a subscription exists.
-- billing_plan: 'artist' | 'shop' | 'founding'.
-- billing_exempt: the house shop + the App Review demo tenant never lock.

alter table public.shops
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_plan text,
  add column if not exists billing_status text,
  add column if not exists billing_seats integer,
  add column if not exists billing_period_end timestamptz,
  add column if not exists billing_exempt boolean not null default false;

update public.shops set billing_exempt = true where slug in ('lumenati', 'apple-review');
