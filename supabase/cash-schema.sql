-- Lumenati — Cash log (makes the Cash Log page real)
-- Run in the Supabase SQL editor. Needs my_role() (square-schema.sql).
--
-- Cash that came in the door, logged at the desk, reconciled against the
-- drawer. Replaces the mock CASH_LOG: entries persist, reconcile sticks, and
-- the books finally see cash.

create table if not exists public.cash_entries (
  id            uuid primary key default gen_random_uuid(),
  date          date not null default current_date,
  artist_id     text references public.artists(id) on delete set null, -- null = shop (walk-in retail, misc)
  amount_cents  integer not null,
  note          text not null default '',
  entered_by    text,                                -- staff email
  reconciled    boolean not null default false,
  reconciled_at timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists cash_entries_date_idx on public.cash_entries (date desc);

-- ── RLS ── desk logs it, books reconcile it: owner + bookkeeper + front desk.
alter table public.cash_entries enable row level security;

drop policy if exists cash_entries_staff_all on public.cash_entries;
create policy cash_entries_staff_all on public.cash_entries for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));
