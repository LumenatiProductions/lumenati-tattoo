-- Lumenati — artist-run promos (2026-07-06). An artist spins up their own
-- discount campaign from the phone ("Flash Friday — 20% off all weekend"),
-- it goes live on their public room page (/slug — the same page the QR cards
-- point at), and they share the caption anywhere. No shop approval loop:
-- their page, their prices, their promo. Text blasts to clients come later
-- (Twilio trial + consent copy still gate outbound marketing).
--
-- One row per campaign. pct_off is optional structure for future POS math;
-- the offer line is the thing clients actually read. ends_at is a plain date
-- (through end of that day); null = runs until the artist ends it.
--
-- Run via the Management API, then: notify pgrst, 'reload schema';

create table if not exists public.artist_campaigns (
  id         text primary key,
  artist_id  text not null references public.artists(id) on delete cascade,
  title      text not null default '',   -- "Flash Friday"
  offer      text not null default '',   -- "20% off flash all weekend"
  pct_off    int,                        -- optional; clamped in UI, sanity-checked here
  ends_at    date,                       -- null = open-ended
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  shop_id    uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  constraint artist_campaigns_pct_chk check (pct_off is null or (pct_off between 1 and 100))
);

create index if not exists artist_campaigns_artist_idx on public.artist_campaigns (artist_id);
create index if not exists artist_campaigns_shop_idx   on public.artist_campaigns (shop_id);

alter table public.artist_campaigns enable row level security;

-- Anyone (the public room page reads with the anon key) can see LIVE promos;
-- an artist sees all of their own, and the desk sees everything.
drop policy if exists campaigns_public_read on public.artist_campaigns;
create policy campaigns_public_read on public.artist_campaigns for select
  using (active);

drop policy if exists campaigns_artist_read on public.artist_campaigns;
create policy campaigns_artist_read on public.artist_campaigns for select
  using (public.my_role() = 'artist' and artist_id = public.my_artist());

drop policy if exists campaigns_staff_read on public.artist_campaigns;
create policy campaigns_staff_read on public.artist_campaigns for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk'));

-- Writes: an artist runs their own promos end to end; the desk can step in.
drop policy if exists campaigns_artist_write on public.artist_campaigns;
create policy campaigns_artist_write on public.artist_campaigns for all
  using (public.my_role() = 'artist' and artist_id = public.my_artist())
  with check (public.my_role() = 'artist' and artist_id = public.my_artist());

drop policy if exists campaigns_staff_write on public.artist_campaigns;
create policy campaigns_staff_write on public.artist_campaigns for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));
