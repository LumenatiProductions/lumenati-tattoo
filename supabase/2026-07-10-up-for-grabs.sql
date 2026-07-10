-- 2026-07-10 up-for-grabs pool (page-walk backlog): "no preference" booking
-- requests become a shared pool any artist can grab from their phone. First
-- tap wins; a grab can be tossed back. Accept/decline stay on the API.

-- Artists see the pool (unclaimed pending requests) plus anything aimed at
-- or grabbed by them.
alter policy "booking_requests_artist_read" on public.booking_requests
  using (
    ((artist_id = my_artist()) or (artist_id is null and status = 'pending'))
    and (shop_id = (select public.current_shop_id()))
  );

-- Artists may update pool rows and their own pending rows; the guard trigger
-- below narrows what an update is allowed to change.
create policy "booking_requests_artist_claim" on public.booking_requests
  for update to authenticated
  using (
    (my_role() = 'artist'::text)
    and (status = 'pending')
    and ((artist_id is null) or (artist_id = my_artist()))
    and (shop_id = (select current_shop_id()))
  )
  with check (
    (my_role() = 'artist'::text)
    and (status = 'pending')
    and ((artist_id is null) or (artist_id = my_artist()))
    and (shop_id = (select current_shop_id()))
  );

-- Artists may only: (a) grab an unclaimed request (artist_id null -> mine),
-- (b) toss their own grab back to the pool (mine -> null). Everything else
-- on the row is pinned; status changes ride the API as admin/owner.
create or replace function public.booking_requests_artist_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  want_artist text := new.artist_id;
begin
  if public.my_role() = 'artist' then
    new := old;
    if old.status = 'pending' then
      if old.artist_id is null and want_artist = public.my_artist() then
        new.artist_id := want_artist;              -- grab
      elsif old.artist_id = public.my_artist() and want_artist is null then
        new.artist_id := null;                     -- toss back
      end if;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists booking_requests_artist_guard on public.booking_requests;
create trigger booking_requests_artist_guard
  before update on public.booking_requests
  for each row execute function public.booking_requests_artist_guard();

notify pgrst, 'reload schema';
