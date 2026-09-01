-- Self-serve booking (2026-09-01): a client picks an open time on the artist's
-- public page and pays the deposit right there; the booking lands confirmed.
--
-- The artist's side: a switch, a weekly hours template, how long a session
-- runs, and the deposit they ask for. The booking's side: a 'held' status for
-- the minutes between "picked a time" and "deposit paid", with an expiry so an
-- abandoned checkout never locks the chair.

alter table public.artists
  add column if not exists self_serve boolean not null default false,
  -- {"mon":[["11:00","19:00"]], "tue":[], ...} on the shop's wall clock.
  -- null = never set, which also means self-serve stays off.
  add column if not exists hours jsonb,
  add column if not exists session_minutes int not null default 120,
  add column if not exists deposit_cents int not null default 0;

-- Public pages read these through the service role, but the signed-in app and
-- admin read the roster with the anon/authenticated key, so the four new
-- columns join the display-column grant (the 2026-07-01 lockdown dropped the
-- table-wide anon grant on purpose; pay terms stay private).
grant select (self_serve, hours, session_minutes, deposit_cents) on public.artists to anon, authenticated;

-- 'held' = slot claimed, deposit not yet paid. Expires (see hold_expires_at);
-- the slot API and the double-booking guard treat an expired hold as free.
alter table public.bookings drop constraint if exists bookings_status_chk;
alter table public.bookings
  add constraint bookings_status_chk
  check (status in ('held', 'scheduled', 'completed', 'no_show', 'cancelled'));

alter table public.bookings add column if not exists hold_expires_at timestamptz;
create index if not exists bookings_held_expiry_idx on public.bookings (hold_expires_at) where status = 'held';

notify pgrst, 'reload schema';
