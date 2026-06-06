-- Lumenati — Stripe Connect schema (artist auto-payouts)
-- Run in the Supabase SQL editor. See POS-STARTER-5-CONNECT-PAYOUTS.md.
--
-- Each artist becomes a Stripe Connect Express account so a card ticket can be
-- split automatically (shop keeps its cut as the application fee, the rest
-- transfers to the artist, and Stripe files their 1099). Additive columns on the
-- existing roster — append-only, does not edit artists-schema.sql.

alter table public.artists add column if not exists stripe_account_id text;
alter table public.artists add column if not exists stripe_onboarded  boolean not null default false;
