-- Lumenati — Healed-photo uploads (closes the healed_photo follow-up loop)
-- Run in the Supabase SQL editor AFTER followups-schema.sql + messaging-schema.sql.
--
-- The 14-day follow-up links the client to /healed/<followup-id>, where they
-- upload their healed shot. Files land in the public-read `healed-photos`
-- bucket (service-role writes only, same as request-refs); each upload is a
-- row here, queued for staff approval on the Social page. Approving appends
-- the shot to the artist's room portfolio.

insert into storage.buckets (id, name, public)
values ('healed-photos', 'healed-photos', true)
on conflict (id) do nothing;

drop policy if exists healed_photos_read on storage.objects;
create policy healed_photos_read on storage.objects
  for select using (bucket_id = 'healed-photos');

create table if not exists public.healed_photos (
  id          uuid primary key default gen_random_uuid(),
  followup_id uuid references public.followups(id) on delete set null,
  booking_id  text references public.bookings(id)  on delete set null,
  client_id   text references public.clients(id)   on delete set null,
  artist_id   text references public.artists(id)   on delete set null,
  url         text not null,
  status      text not null default 'pending',     -- pending | approved | dismissed
  created_at  timestamptz not null default now(),
  constraint healed_photos_status_chk check (status in ('pending','approved','dismissed'))
);

create index if not exists healed_photos_status_idx on public.healed_photos (status, created_at desc);

-- ── RLS ── the social/front-of-house crew curates; artists see their own.
alter table public.healed_photos enable row level security;

drop policy if exists healed_photos_staff_all on public.healed_photos;
create policy healed_photos_staff_all on public.healed_photos for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists healed_photos_artist_read on public.healed_photos;
create policy healed_photos_artist_read on public.healed_photos for select
  using (artist_id = public.my_artist());
