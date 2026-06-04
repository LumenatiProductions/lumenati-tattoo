-- Lumenati — room content schema
-- Run this in the Supabase project's SQL editor (Dashboard -> SQL -> New query).
-- One row per artist; polaroids/portfolio are JSONB arrays mirroring RoomContent.

create table if not exists public.room_content (
  artist_id     text primary key,
  tagline       text not null default '',
  bio           text not null default '',
  ig_handle     text not null default '',
  song_id       text not null default 'offspring',
  accent_color  text not null default '#FF1493',
  profile_photo text not null default '',
  polaroids     jsonb not null default '[]'::jsonb,
  portfolio     jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

-- Keep updated_at fresh on writes.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists room_content_touch on public.room_content;
create trigger room_content_touch before update on public.room_content
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ──
alter table public.room_content enable row level security;

-- Public can READ every room (the public site renders from this).
drop policy if exists room_content_read on public.room_content;
create policy room_content_read on public.room_content
  for select using (true);

-- TEMPORARY: anyone can write, because the dashboard has no auth yet (matches
-- the current localStorage version's posture). LOCK THIS DOWN to authenticated
-- artists editing only their own row once Supabase Auth lands.
drop policy if exists room_content_write_temp on public.room_content;
create policy room_content_write_temp on public.room_content
  for all using (true) with check (true);

-- ── Storage bucket for uploaded room photos ──
insert into storage.buckets (id, name, public)
values ('room-photos', 'room-photos', true)
on conflict (id) do nothing;

drop policy if exists room_photos_read on storage.objects;
create policy room_photos_read on storage.objects
  for select using (bucket_id = 'room-photos');

-- TEMPORARY open upload, same caveat as above.
drop policy if exists room_photos_write_temp on storage.objects;
create policy room_photos_write_temp on storage.objects
  for insert with check (bucket_id = 'room-photos');

-- ── Seed: the 6 artists, matching the editor's starting content ──
insert into public.room_content
  (artist_id, tagline, bio, ig_handle, song_id, accent_color, profile_photo, polaroids, portfolio)
values
  ('jd', 'skater // gamer // bold color tattoos',
   'what''s up, I''m JD. i do big bold colorful tattoos. when i''m not tattooing i''m probably skating or gaming. DM me to book something rad or just swing by the shop -- i''m the nice one :)',
   'jd.pruitt', 'goldfinger', '#FF1493', '/legacy-assets/sqsp-000.jpg',
   '[{"id":"jd-p1","src":"/legacy-assets/sqsp-021.jpg","caption":"@ the shop"},{"id":"jd-p2","src":"/legacy-assets/sqsp-010.jpg","caption":"<3 Penny"},{"id":"jd-p3","src":"/legacy-assets/sqsp-025.jpg","caption":"vibes :)"}]'::jsonb,
   '[{"id":"jd-f1","src":"/legacy-assets/sqsp-003.jpg","alt":"color piece"},{"id":"jd-f2","src":"/legacy-assets/sqsp-001.jpg","alt":"black & grey"},{"id":"jd-f3","src":"/legacy-assets/sqsp-029.jpg","alt":"flash"}]'::jsonb),
  ('elaine', 'fine line // florals // electric energy',
   'Electric Elaine here. delicate fine-line and floral work. tap edit and make this your own :)',
   'electric.elaine', 'no-doubt', '#FFD700', '/legacy-assets/sqsp-034.jpg',
   '[]'::jsonb,
   '[{"id":"el-f1","src":"/legacy-assets/sqsp-034.jpg","alt":"fine line"}]'::jsonb),
  ('shorty', 'bold // traditional // loud',
   'ShorTy. traditional and bold. this is a starter bio -- edit me from the command center.',
   'shorty.tattoo', 'shorty', '#7FFF00', '/legacy-assets/sqsp-031.png',
   '[]'::jsonb, '[]'::jsonb),
  ('kalypso', 'color // realism // royalty',
   'King Kalypso. color realism. edit this to tell your story.',
   'king.kalypso', 'outkast', '#1493FF', '/legacy-assets/sqsp-063.png',
   '[]'::jsonb, '[]'::jsonb),
  ('sam', 'blackwork // illustrative // clean lines',
   'Sam Durbin-Clark. illustrative blackwork. swing by or DM to book.',
   'sam.durbinclark', 'blink182', '#9b59b6', '/legacy-assets/sqsp-075.jpg',
   '[{"id":"sam-p1","src":"/legacy-assets/sqsp-076.jpg","caption":"studio"}]'::jsonb,
   '[{"id":"sam-f1","src":"/legacy-assets/sqsp-077.jpg","alt":"blackwork"},{"id":"sam-f2","src":"/legacy-assets/sqsp-076.jpg","alt":"lines"}]'::jsonb),
  ('moonie', 'dark // surreal // dreamy',
   'Moonie B. Jones, guest spot. dark surreal pieces. edit me!',
   'moonie.b.jones', 'manson', '#FF6347', '/legacy-assets/sqsp-087.png',
   '[]'::jsonb, '[]'::jsonb)
on conflict (artist_id) do nothing;
