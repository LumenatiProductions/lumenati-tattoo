-- Sweep the eight arcade-demo-* playground rooms (Scott said he's done
-- playing; confirmed before running). Verified the only rows referencing
-- these ids are 3 flash_pieces (demo flash) — everything else is zero.

begin;

delete from flash_pieces where artist_id like 'arcade-demo-%';
delete from room_content where artist_id like 'arcade-demo-%';
delete from artists where id like 'arcade-demo-%';

commit;
