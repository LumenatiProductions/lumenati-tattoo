-- The Y2K site's guestbook and poll (2026-09-03). Both service-role only:
-- visitors write through /api/site/*, the shop reads and approves in /admin.
create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id) on delete cascade,
  name text not null,
  from_where text,
  message text not null,
  approved boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists guestbook_entries_shop_idx on public.guestbook_entries (shop_id, approved, created_at desc);
alter table public.guestbook_entries enable row level security;
revoke all on public.guestbook_entries from anon, authenticated;

create table if not exists public.site_polls (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists site_polls_active_idx on public.site_polls (shop_id, active, created_at desc);
alter table public.site_polls enable row level security;
revoke all on public.site_polls from anon, authenticated;

create table if not exists public.site_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.site_polls(id) on delete cascade,
  option_key text not null,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_hash)
);
alter table public.site_poll_votes enable row level security;
revoke all on public.site_poll_votes from anon, authenticated;

insert into public.site_polls (question, options, active)
select 'What should we put on the flash wall next?',
  '[{"key":"traditional","label":"Traditional"},{"key":"fineline","label":"Fine line"},{"key":"blackwork","label":"Blackwork"},{"key":"realism","label":"Color realism"},{"key":"anime","label":"Anime"}]'::jsonb,
  true
where not exists (select 1 from public.site_polls where shop_id = '11111111-1111-1111-1111-111111111111');
notify pgrst, 'reload schema';
