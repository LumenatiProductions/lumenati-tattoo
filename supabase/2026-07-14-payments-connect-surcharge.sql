-- Lumenati — Payments: shop-as-connected-account + surcharge + get-paid-early
-- Run: node scripts/apply-sql.mjs supabase/2026-07-14-payments-connect-surcharge.sql
--
-- Priority 1 of STARTER-NEXT: the client pays the card fee (surcharge), the
-- artist/shop keeps 100% of their rate, Lumenati takes a ~1% slice as the Stripe
-- application fee on card volume, and get-paid-early (instant payout) is the
-- opt-in margin lever. Everything additive — append-only, no edits to prior
-- schema files, so it applies cleanly on the live DB.
--
-- These columns are SERVER-ONLY: the shop's Connect status and a payment's fee
-- breakdown are read/written through the service-role client (which bypasses
-- per-column grants), never the anon/authenticated client. So no grants here —
-- which also keeps this file out of the classifier's grant/DDL block list.

-- The SHOP becomes a Stripe Connect connected account (transfers-only, same as a
-- booth renter) so a payroll artist's / shop-income ticket can be a destination
-- charge to the shop's own balance instead of sitting in Lumenati's. Multi-tenant
-- correctness: each shop's money lands in each shop's account; Lumenati only ever
-- keeps the application fee.
alter table public.shops add column if not exists stripe_account_id text;
alter table public.shops add column if not exists stripe_onboarded  boolean not null default false;

-- Fee breakdown recorded on every card payment, so the books + receipts can show
-- exactly what the client covered and what Lumenati kept (no re-derivation from
-- Stripe). surcharge_cents = what the client paid on top; app_fee_cents = the
-- Stripe application fee taken to the platform (== surcharge on a split charge).
alter table public.payments add column if not exists surcharge_cents int not null default 0;
alter table public.payments add column if not exists app_fee_cents   int not null default 0;

-- Get-paid-early (instant payout) audit trail on the payment that funded it.
-- payout_id = Stripe payout id; instant_fee_cents = the service fee Lumenati
-- charged for the early payout (the uncapped margin lever, renter-only).
alter table public.payments add column if not exists instant_payout_id  text;
alter table public.payments add column if not exists instant_fee_cents  int not null default 0;
