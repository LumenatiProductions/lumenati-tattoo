-- All socials on the artist page (Scott, 2026-07-12): one jsonb bag —
-- { instagram, tiktok, x, youtube, facebook, website } as handles/URLs.
-- ig_handle stays for back-compat; readers prefer socials.instagram.
-- Real account CONNECTION (OAuth) comes with the Meta developer app later;
-- these are typed handles for now.
alter table public.room_content
  add column if not exists socials jsonb;

notify pgrst, 'reload schema';
