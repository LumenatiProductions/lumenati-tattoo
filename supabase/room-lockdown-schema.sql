-- Lock down room_content writes (replaces the launch-era "anyone can write"
-- TEMPORARY policy). Reads stay public — the public site renders rooms.
-- Writers: an artist on their OWN row (profiles.artist_id = my_artist()),
-- and owners on any row. Paste into the Supabase SQL editor and Run.

drop policy if exists room_content_write_temp on public.room_content;
drop policy if exists room_content_artist_write on public.room_content;
drop policy if exists room_content_owner_write on public.room_content;

create policy room_content_artist_write on public.room_content for all
  using (artist_id = public.my_artist())
  with check (artist_id = public.my_artist());

create policy room_content_owner_write on public.room_content for all
  using (public.is_owner())
  with check (public.is_owner());
