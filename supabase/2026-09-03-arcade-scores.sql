-- The arcade's shared high-score wall (2026-09-03). Every finished run lands
-- here; signed runs (three initials) make the boards, unsigned ones only count
-- as plays. Service-role only: the games talk to /api/arcade/scores, never to
-- the table. Scoped by shop so a second shop's cabinet keeps its own wall.
create table if not exists public.arcade_scores (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id) on delete cascade,
  game text not null,
  name text check (name is null or name ~ '^[A-Z]{3}$'),
  score integer not null check (score >= 0),
  level integer not null default 1,
  duration_s integer not null default 0,
  device text not null default 'web',
  artist_id uuid,
  meta jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists arcade_scores_wall_idx on public.arcade_scores (shop_id, game, score desc, created_at asc) where name is not null;
create index if not exists arcade_scores_recent_idx on public.arcade_scores (shop_id, game, created_at desc);
alter table public.arcade_scores enable row level security;
revoke all on public.arcade_scores from anon, authenticated;
notify pgrst, 'reload schema';
