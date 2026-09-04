-- Who is on the site right now (2026-09-03). Every open tab heartbeats
-- /api/site/presence with a per-tab id; "online now" is how many distinct ids
-- were seen in the last 90 seconds. Service-role only, and the route prunes
-- rows older than ten minutes as it goes, so the table never grows.
create table if not exists public.site_presence (
  session_id text primary key,
  path text,
  last_seen timestamptz not null default now(),
  ip_hash text
);
create index if not exists site_presence_last_seen_idx on public.site_presence (last_seen desc);
alter table public.site_presence enable row level security;
revoke all on public.site_presence from anon, authenticated;
notify pgrst, 'reload schema';
