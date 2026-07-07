-- Lumenati — slot offers: first tap takes it (2026-07-07). Scott's upgrade to
-- the waitlist: instead of the desk texting people one at a time, a freed slot
-- is OFFERED — every matching waitlist entry gets a text with a claim link,
-- the first person to tap books themselves, everyone after sees "you just
-- missed it" and stays on the list. One row per offered slot; the row's uuid
-- is the public capability in the claim URL (same pattern as /healed, /care).
--
-- The claim itself is atomic: UPDATE ... WHERE status='open' — Postgres picks
-- exactly one winner no matter how many thumbs race.
--
-- Run via the Management API, then: notify pgrst, 'reload schema';

create table if not exists public.slot_offers (
  id                  uuid primary key default gen_random_uuid(),
  artist_id           text not null references public.artists(id) on delete cascade,
  starts_at           timestamptz not null,
  service_hint        text not null default '',
  status              text not null default 'open',      -- open | claimed | cancelled
  claimed_waitlist_id text references public.waitlist(id) on delete set null,
  booking_id          text references public.bookings(id) on delete set null,
  offered_count       int not null default 0,            -- how many texts went out
  created_at          timestamptz not null default now(),
  shop_id             uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  constraint slot_offers_status_chk check (status in ('open','claimed','cancelled'))
);

create index if not exists slot_offers_artist_idx on public.slot_offers (artist_id, status);
create index if not exists slot_offers_shop_idx   on public.slot_offers (shop_id);

alter table public.slot_offers enable row level security;

-- Staff and the slot's own artist can see/manage offers from the app; the
-- public claim flow runs entirely through the service-role API (the uuid is
-- the capability), so anon gets no direct table access at all.
drop policy if exists slot_offers_staff_all on public.slot_offers;
create policy slot_offers_staff_all on public.slot_offers for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists slot_offers_artist_read on public.slot_offers;
create policy slot_offers_artist_read on public.slot_offers for select
  using (public.my_role() = 'artist' and artist_id = public.my_artist());
