-- Lumenati — Public booking requests
-- Run in the Supabase SQL editor AFTER bookings-schema.sql + artists-schema.sql.
--
-- A walk-up on the website asks for time in the chair; the desk reviews it on
-- the Bookings page and either declines or converts it into a real booking
-- (source = web_request). The public form writes via the service-role API —
-- there is NO public insert policy; RLS below is for staff reads/updates only.

create table if not exists public.booking_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  artist_id   text references public.artists(id) on delete set null, -- null = any artist
  idea        text not null default '',           -- what they want
  placement   text not null default '',           -- where on the body
  size        text not null default '',           -- rough size
  availability text not null default '',          -- when they can come in
  status      text not null default 'pending',    -- pending | accepted | declined
  booking_id  text references public.bookings(id) on delete set null, -- set on accept
  handled_by  text,                                -- staff email
  handled_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint booking_requests_status_chk check (status in ('pending','accepted','declined')),
  constraint booking_requests_contact_chk check (email is not null or phone is not null)
);

create index if not exists booking_requests_status_idx on public.booking_requests (status, created_at desc);

-- ── RLS ── desk + owner work the inbox; artists can see requests aimed at them.
alter table public.booking_requests enable row level security;

drop policy if exists booking_requests_staff_all on public.booking_requests;
create policy booking_requests_staff_all on public.booking_requests for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists booking_requests_artist_read on public.booking_requests;
create policy booking_requests_artist_read on public.booking_requests for select
  using (artist_id = public.my_artist());
