-- 2026-07-10 arcade follow-up: artists can title their room video. The title
-- becomes the media player window's filename (slugified, .avi flavor).
-- NULL falls back to the handle-based name.
alter table public.room_content
  add column if not exists video_title text;

notify pgrst, 'reload schema';
