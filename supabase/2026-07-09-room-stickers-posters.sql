-- 2026-07-09 rooms part 3: sticker + poster picker (page-walk item 5).
-- stickers: chosen catalog ids (jsonb string array). posters: the artist's
-- own wall-poster images (jsonb array of {id, src}). NULL means "not chosen
-- yet" and the room keeps its current baked-in look — nothing changes until
-- the artist picks.
alter table public.room_content
  add column if not exists stickers jsonb,
  add column if not exists posters jsonb;

notify pgrst, 'reload schema';
