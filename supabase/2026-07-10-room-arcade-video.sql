-- 2026-07-10 the arcade: artists pick a game for their room + upload a video.
-- game_id: arcade catalog id (see GAME_CATALOG in lib/admin/render-room.ts).
-- video_url: uploaded clip (public room-photos bucket, same policies as
-- photos). NULL means "not chosen yet": JD's room keeps its baked-in skate
-- game + Vimeo clip, everyone else's room has neither window — nothing
-- changes until the artist picks.
alter table public.room_content
  add column if not exists game_id text,
  add column if not exists video_url text;

notify pgrst, 'reload schema';
