-- Lumenati — waitlist + no-show defense (2026-07-07). The list of people who
-- want in sooner. When a booking cancels or no-shows, that hole in the day is
-- dead money — the app now answers "who's waiting?" right at the cancel
-- moment and books them into the freed slot. Deposit forfeiture already
-- punishes the no-show; this recovers the time.
--
-- name/phone are snapshotted on the row (not just a client_id) because the
-- person waiting may not be a client yet, and because an artist's RLS view of
-- `clients` only covers people they've already worked on. client_id is an
-- optional link when they ARE known. artist_id null = happy with anyone.
--
-- Run via the Management API, then: notify pgrst, 'reload schema';

create table if not exists public.waitlist (
  id         text primary key,
  artist_id  text references public.artists(id) on delete cascade,  -- null = any artist
  client_id  text references public.clients(id) on delete set null,
  name       text not null default '',
  phone      text,
  want       text not null default '',   -- what they're after ("flash piece", "half-sleeve start")
  active     boolean not null default true,
  booked_id  text references public.bookings(id) on delete set null, -- set when a slot fill retires the row
  created_at timestamptz not null default now(),
  shop_id    uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id)
);

create index if not exists waitlist_artist_idx on public.waitlist (artist_id) where active;
create index if not exists waitlist_shop_idx   on public.waitlist (shop_id);

alter table public.waitlist enable row level security;

-- Staff run the whole list; an artist sees and works their own lane PLUS the
-- "any artist" pool (those entries are theirs to claim).
drop policy if exists waitlist_staff_all on public.waitlist;
create policy waitlist_staff_all on public.waitlist for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists waitlist_artist_all on public.waitlist;
create policy waitlist_artist_all on public.waitlist for all
  using (public.my_role() = 'artist' and (artist_id = public.my_artist() or artist_id is null))
  with check (public.my_role() = 'artist' and (artist_id = public.my_artist() or artist_id is null));
