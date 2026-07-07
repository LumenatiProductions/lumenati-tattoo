-- Lumenati — review velocity (2026-07-07). One snapshot per day of the shop's
-- Google standing (star rating + total review count). Velocity = the deltas
-- between snapshots, charted on Reports next to how many review ASKS the
-- follow-up engine sent — so the shop can see whether asks turn into stars.
--
-- Two sources, same rows:
--   places — the daily ops job reads the Google Places API when
--            GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID are set (key-based, no
--            OAuth circus).
--   manual — the desk logs the count by hand on Reports until then.
--
-- Run via the Management API, then: notify pgrst, 'reload schema';

create table if not exists public.review_snapshots (
  captured_on  date primary key,
  rating       numeric(3,2),
  review_count int not null,
  source       text not null default 'manual',   -- places | manual
  created_at   timestamptz not null default now(),
  shop_id      uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  constraint review_snapshots_source_chk check (source in ('places','manual'))
);

create index if not exists review_snapshots_shop_idx on public.review_snapshots (shop_id);

alter table public.review_snapshots enable row level security;

-- Owner + bookkeeper read Reports; the desk can log a manual count too. The
-- Places job writes with the service role.
drop policy if exists review_snapshots_staff_all on public.review_snapshots;
create policy review_snapshots_staff_all on public.review_snapshots for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));
