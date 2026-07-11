-- Schema sweep (deep-pass lane 2, 2026-07-11).
--
-- 1) FK drift fix: profiles/sales/square_team_members pointed artist_id at
--    room_content(artist_id) instead of artists(id). room_content is display
--    data; artists is the business record. Verified zero orphans on all three
--    before the repoint, so this is a pure re-target (same values, same type).
--    room_content.artist_id also gets its missing FK to artists, making it a
--    true 1:1 child of the roster.
-- 2) Hot-path index: bookings by artist + date is the calendar's main read;
--    composite index covers it in one scan.

begin;

alter table profiles
  drop constraint profiles_artist_id_fkey,
  add constraint profiles_artist_id_fkey
    foreign key (artist_id) references artists(id) on delete set null;

alter table sales
  drop constraint sales_artist_id_fkey,
  add constraint sales_artist_id_fkey
    foreign key (artist_id) references artists(id) on delete set null;

alter table square_team_members
  drop constraint square_team_members_artist_id_fkey,
  add constraint square_team_members_artist_id_fkey
    foreign key (artist_id) references artists(id) on delete set null;

alter table room_content
  add constraint room_content_artist_id_fkey
    foreign key (artist_id) references artists(id) on delete cascade;

create index if not exists bookings_artist_starts_idx
  on bookings (artist_id, starts_at);

commit;
