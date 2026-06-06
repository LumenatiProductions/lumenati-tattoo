-- Lumenati — Shop expenses (owned books, POS-STARTER-7)
-- Run in the Supabase SQL editor. Needs my_role() (square-schema.sql).
--
-- The money that goes OUT that isn't an artist split: supplies the SHOP buys,
-- building rent/lease, utilities, software, etc. This is the missing piece that
-- makes Reports + Stripe records a complete set of books, so QuickBooks becomes
-- optional. (Distinct from `artist_expenses`, which is each artist's OWN
-- deductions, keyed to their auth user — see app-personal-schema.sql.)

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  date         date not null default current_date,
  category     text not null default 'other',  -- supplies | rent | utilities | software | equipment | fees | other
  vendor       text,
  amount_cents integer not null,
  note         text not null default '',
  receipt_url  text,
  created_at   timestamptz not null default now()
);

create index if not exists expenses_date_idx     on public.expenses (date desc);
create index if not exists expenses_category_idx on public.expenses (category);

-- ── RLS ── owner + bookkeeper run the books.
alter table public.expenses enable row level security;

drop policy if exists expenses_books_read on public.expenses;
create policy expenses_books_read on public.expenses for select
  using (public.my_role() in ('owner','bookkeeper'));

drop policy if exists expenses_books_write on public.expenses;
create policy expenses_books_write on public.expenses for all
  using (public.my_role() in ('owner','bookkeeper'))
  with check (public.my_role() in ('owner','bookkeeper'));
