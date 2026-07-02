-- Lumenati — Security lockdown, Milestone 1 (2026-07-01)
-- Run this in the Supabase project's SQL editor (Dashboard -> SQL -> New query -> Run).
-- Safe to run more than once (idempotent). Closes two live holes:
--   #1  room_content + room-photos storage were world-writable ("TEMPORARY" launch
--       policies that never got locked). Now only signed-in staff can write.
--   #2  the public/anon key could read every artist's private business terms
--       (rent, split, Stripe account). Now those columns are hidden from anon;
--       staff (authenticated) and server (service role) still see everything.
-- Public READS of rooms/photos stay open on purpose (the public site renders them).
-- Requires helpers from auth-schema.sql (is_owner) and square-schema.sql (my_role, my_artist).

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- #1a  room_content: writers = an artist on their own row, or an owner on any.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists room_content_write_temp   on public.room_content;
drop policy if exists room_content_artist_write on public.room_content;
drop policy if exists room_content_owner_write  on public.room_content;

create policy room_content_artist_write on public.room_content for all
  using (artist_id = public.my_artist())
  with check (artist_id = public.my_artist());

create policy room_content_owner_write on public.room_content for all
  using (public.is_owner())
  with check (public.is_owner());

-- ─────────────────────────────────────────────────────────────────────────
-- #1b  room-photos storage bucket: only a known staff/artist may upload/change
--      files. Public read stays (portfolio images are meant to be seen).
--      my_role() returns null for anyone not on the profiles allowlist.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists room_photos_write_temp    on storage.objects;
drop policy if exists room_photos_staff_write   on storage.objects;
drop policy if exists room_photos_staff_modify  on storage.objects;
drop policy if exists room_photos_staff_delete  on storage.objects;

create policy room_photos_staff_write on storage.objects for insert to authenticated
  with check (bucket_id = 'room-photos' and public.my_role() is not null);

create policy room_photos_staff_modify on storage.objects for update to authenticated
  using       (bucket_id = 'room-photos' and public.my_role() is not null)
  with check  (bucket_id = 'room-photos' and public.my_role() is not null);

create policy room_photos_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'room-photos' and public.my_role() is not null);

-- ─────────────────────────────────────────────────────────────────────────
-- #2  Hide artists' private business terms from the public/anon key.
--     Public site only needs id/slug/name/handle/color/guest/active/room_extras/sort.
--     (App public reads were updated to select only those columns.)
-- ─────────────────────────────────────────────────────────────────────────
revoke select (pay_type, rent_cents, split_pct, stripe_account_id, stripe_onboarded)
  on public.artists from anon;

commit;

-- ── Verify (optional; run separately). With the ANON key these should now:
--   select * from artists            -> ERROR (permission denied for column ...)
--   select id,slug,name from artists -> still works
--   insert/update room_content       -> blocked unless signed-in staff
