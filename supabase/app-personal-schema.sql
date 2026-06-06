-- Lumenati — Artist personal data (goals + deductions) for the app (POS 6b)
-- Run in the Supabase SQL editor. See POS-STARTER-6-THE-APP.md.
--
-- These are the artist's OWN entrepreneurial data: income goals and the business
-- expenses they deduct. Keyed to the auth user (not artist_id), so it needs no
-- roster mapping and is strictly private — RLS lets each user touch only their
-- own rows. Shop financials stay in the existing per-feature tables.

create table if not exists public.artist_goals (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  weekly_cents     integer not null default 0,
  monthly_cents    integer not null default 0,
  tax_setaside_pct numeric not null default 0.30,   -- 0..1, suggested reserve
  updated_at       timestamptz not null default now()
);

create table if not exists public.artist_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         date not null default current_date,
  category     text not null default 'supplies',    -- supplies | equipment | rent | education | travel | other
  vendor       text,
  amount_cents integer not null,
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists artist_expenses_user_idx on public.artist_expenses (user_id, date desc);

-- ── RLS ── each user sees + writes only their own rows.
alter table public.artist_goals    enable row level security;
alter table public.artist_expenses enable row level security;

drop policy if exists artist_goals_own on public.artist_goals;
create policy artist_goals_own on public.artist_goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists artist_expenses_own on public.artist_expenses;
create policy artist_expenses_own on public.artist_expenses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
