-- Lumenati — Kiosk schema (self check-in)
-- Run in the Supabase SQL editor. See POS-STARTER-2-KIOSK-CHECKIN.md.
--
-- Check-in is a timestamp, not a status: `bookings.status` is constrained to
-- scheduled/completed/no_show/cancelled and other features depend on those
-- values, so we record arrival in an additive nullable column instead of adding
-- a fifth status. A booking stays `scheduled` until it completes; `checked_in_at`
-- just says "they're here". Lane-safe: this is an append-only file, it does not
-- edit bookings-schema.sql.

alter table public.bookings add column if not exists checked_in_at timestamptz;

create index if not exists bookings_checked_in_idx
  on public.bookings (checked_in_at);
