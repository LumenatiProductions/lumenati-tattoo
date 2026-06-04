-- Lumenati — Square sync schema (sales mirror + team-member mapping)
-- Run in the Supabase SQL editor after auth-schema.sql.

-- Helpers: caller's role / artist, SECURITY DEFINER to avoid RLS recursion.
create or replace function public.my_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.profiles where email = auth.email() limit 1
$$;
create or replace function public.my_artist()
returns text language sql security definer stable set search_path = public as $$
  select artist_id from public.profiles where email = auth.email() limit 1
$$;
grant execute on function public.my_role(), public.my_artist() to anon, authenticated;

-- Square team members (cache + mapping to our artists).
create table if not exists public.square_team_members (
  square_id   text primary key,
  name        text,
  artist_id   text references public.room_content(artist_id) on delete set null,
  last_synced timestamptz default now()
);

-- Sales mirrored from Square (read-only mirror; we never write back to Square).
create table if not exists public.sales (
  id            text primary key,              -- Square payment id
  created_at    timestamptz not null,
  service_cents int not null default 0,
  tip_cents     int not null default 0,
  method        text not null default 'other', -- card | cash | other
  team_member_id text,
  artist_id     text references public.room_content(artist_id) on delete set null,
  location_id   text,
  status        text,
  synced_at     timestamptz not null default now()
);
create index if not exists sales_created_idx on public.sales (created_at);
create index if not exists sales_artist_idx  on public.sales (artist_id);

-- Sync bookkeeping (single row).
create table if not exists public.square_sync (
  id             int primary key default 1,
  last_synced_at timestamptz,
  last_result    text,
  constraint square_sync_singleton check (id = 1)
);
insert into public.square_sync (id) values (1) on conflict (id) do nothing;

-- ── RLS ──
alter table public.square_team_members enable row level security;
alter table public.sales enable row level security;
alter table public.square_sync enable row level security;

-- Sales: owners/bookkeeper see all; an artist sees only their own.
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select using (
  public.my_role() in ('owner','bookkeeper')
  or (public.my_role() = 'artist' and artist_id = public.my_artist())
);
drop policy if exists sales_owner_write on public.sales;
create policy sales_owner_write on public.sales for all
  using (public.is_owner()) with check (public.is_owner());

-- Team-member mapping + sync state: owners/bookkeeper read, owners manage.
drop policy if exists stm_read on public.square_team_members;
create policy stm_read on public.square_team_members for select
  using (public.my_role() in ('owner','bookkeeper'));
drop policy if exists stm_owner_write on public.square_team_members;
create policy stm_owner_write on public.square_team_members for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists sync_read on public.square_sync;
create policy sync_read on public.square_sync for select
  using (public.my_role() in ('owner','bookkeeper'));
drop policy if exists sync_owner_write on public.square_sync;
create policy sync_owner_write on public.square_sync for all
  using (public.is_owner()) with check (public.is_owner());
