-- Retire room_content.game_id — the cabinet selector made per-artist game
-- picks dead (renderer ignores it; app + web mappers stopped touching it
-- 2026-07-11).
--
-- DO NOT RUN until build 21 is live on TestFlight: older app builds probe
-- this column's presence (select * ... game_id !== undefined) to decide
-- whether to show the Page video editor. Dropping it early hides the video
-- section for anyone still on build 20.

alter table room_content drop column if exists game_id;
