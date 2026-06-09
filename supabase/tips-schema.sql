-- Lumenati — Tips on the pay flow
-- Run in the Supabase SQL editor AFTER payments-schema.sql.
--
-- The /pay page now offers a tip before checkout. The tip is stored next to
-- the service amount (never mixed into amount_cents) so books stay clean:
-- Connect's application fee applies to the service only, and the tip rides the
-- transfer to the artist in full.

alter table public.payments
  add column if not exists tip_cents integer not null default 0;
