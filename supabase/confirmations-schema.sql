-- Lumenati — Booking confirmations (reply C to a reminder text)
-- Run in the Supabase SQL editor AFTER bookings-schema.sql.
--
-- The reminder texts say "Reply C to confirm" — the Twilio inbound webhook
-- (/api/sms/inbound) stamps this when the client does. The Bookings page shows
-- a Confirmed badge so the desk knows who's solid and who's a no-show risk.

alter table public.bookings
  add column if not exists confirmed_at timestamptz;
