-- IMs sent from the Y2K site's AIM buddy list (2026-09-03). A visitor picks an
-- artist and types a message; it lands here for the shop to read in the
-- Command Center. Service-role only: the site talks to /api/site/im.
create table if not exists public.site_ims (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id) on delete cascade,
  artist_id text references public.artists(id) on delete set null,
  from_name text not null,
  contact text not null default '',
  message text not null,
  ip_hash text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists site_ims_shop_recent_idx on public.site_ims (shop_id, created_at desc);
alter table public.site_ims enable row level security;
revoke all on public.site_ims from anon, authenticated;
notify pgrst, 'reload schema';
