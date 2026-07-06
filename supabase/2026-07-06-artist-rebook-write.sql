-- Lumenati — the rebook moment (2026-07-06). The app now asks for the next
-- session right on the paid screen, and that screen is usually in an ARTIST's
-- hands — but bookings/clients writes were staff-only, so an artist's "Book
-- their next session" (and the home screen's New booking form) died at insert.
--
-- Two narrow INSERT policies, both pinned to my_artist() so an artist can only
-- ever book themselves and only tag a new walk-in as their own client. Staff
-- writes (bookings_staff_write / clients_staff_write) are untouched. Artists
-- still cannot UPDATE or DELETE either table, and clients_artist_read stays
-- booking-scoped — a freshly created client becomes readable to its artist the
-- moment the booking lands, which the rebook flow does in the same breath.
--
-- Run via the Management API, then: notify pgrst, 'reload schema';

drop policy if exists bookings_artist_insert on public.bookings;
create policy bookings_artist_insert on public.bookings for insert
  with check (public.my_role() = 'artist' and artist_id = public.my_artist());

drop policy if exists clients_artist_insert on public.clients;
create policy clients_artist_insert on public.clients for insert
  with check (public.my_role() = 'artist' and preferred_artist_id = public.my_artist());
