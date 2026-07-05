-- Lumenati — Money OUT layer (2026-07-04)
-- Completes the books so QuickBooks can go away: recurring bills that post real
-- expense rows when due, owner draws (distributions, NOT expenses), and sales
-- tax capture (rate on the shop, 'tax' rows in the ledger, tax on cash entries).
-- Apply via the Supabase Management API, then: notify pgrst, 'reload schema';

begin;

-- ── 1. Recurring bills ──────────────────────────────────────────────────────
-- Templates (shop lease, utilities, software). Posting one creates a normal
-- `expenses` row stamped with (recurring_id, period) so a period can never
-- double-post, then advances next_due by the cadence.
create table if not exists public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  name         text not null,
  category     text not null default 'other',  -- supplies | rent | utilities | software | equipment | fees | other
  vendor       text,
  amount_cents integer not null check (amount_cents > 0),
  cadence      text not null default 'monthly' check (cadence in ('weekly','monthly','quarterly','yearly')),
  next_due     date not null,
  active       boolean not null default true,
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists recurring_expenses_due_idx on public.recurring_expenses (active, next_due);

alter table public.recurring_expenses enable row level security;
drop policy if exists recurring_expenses_books_all on public.recurring_expenses;
create policy recurring_expenses_books_all on public.recurring_expenses for all
  using (public.my_role() in ('owner','bookkeeper'))
  with check (public.my_role() in ('owner','bookkeeper'));

-- Posted expenses remember which bill + period they came from (idempotency).
alter table public.expenses add column if not exists recurring_id uuid references public.recurring_expenses(id) on delete set null;
alter table public.expenses add column if not exists period text;
create unique index if not exists expenses_recurring_period_idx
  on public.expenses (recurring_id, period) where recurring_id is not null;

-- ── 2. Owner draws ──────────────────────────────────────────────────────────
-- Money the owner takes out of the business. A distribution, not an expense:
-- it never reduces profit on the P&L, it sits below the line.
create table if not exists public.owner_draws (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  date         date not null default current_date,
  amount_cents integer not null check (amount_cents > 0),
  method       text not null default 'transfer' check (method in ('cash','check','transfer','other')),
  note         text not null default '',
  entered_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists owner_draws_date_idx on public.owner_draws (date desc);

alter table public.owner_draws enable row level security;
drop policy if exists owner_draws_books_all on public.owner_draws;
create policy owner_draws_books_all on public.owner_draws for all
  using (public.my_role() in ('owner','bookkeeper'))
  with check (public.my_role() in ('owner','bookkeeper'));

-- ── 3. Sales tax ────────────────────────────────────────────────────────────
-- Rate lives on the shop (basis points: 725 = 7.25%). Tax collected lands in
-- the ledger as its own kind so the remittance figure is one SUM. Cash entries
-- carry the tax split so the drawer log matches the ledger.
alter table public.shops add column if not exists sales_tax_bps integer not null default 0;

alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check check (kind in
  ('sale','tip','deposit','deposit_refund','refund','payout','rent','expense','adjustment','tax','draw'));

alter table public.cash_entries add column if not exists tax_cents integer not null default 0;

commit;
