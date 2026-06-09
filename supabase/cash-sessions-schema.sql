-- Lumenati — Cash drawer sessions (open / count / close)
-- Run in the Supabase SQL editor AFTER cash-schema.sql.
--
-- Real drawer discipline on top of the entry log: open the drawer with a
-- starting float, log cash through the day (cash_entries), then close by
-- counting the drawer. Expected = float + entries logged while the session was
-- open; over/short = counted - expected, frozen on the row at close.

create table if not exists public.cash_sessions (
  id                  uuid primary key default gen_random_uuid(),
  opened_at           timestamptz not null default now(),
  opened_by           text,                          -- staff email
  opening_float_cents integer not null default 0,
  closed_at           timestamptz,
  closed_by           text,
  expected_cents      integer,                       -- computed at close
  counted_cents       integer,                       -- what was actually in the drawer
  over_short_cents    integer,                       -- counted - expected (+over / -short)
  note                text not null default '',
  constraint cash_sessions_close_chk
    check (closed_at is null or (counted_cents is not null and expected_cents is not null))
);

create index if not exists cash_sessions_open_idx on public.cash_sessions (closed_at) where closed_at is null;
create index if not exists cash_sessions_opened_idx on public.cash_sessions (opened_at desc);

-- ── RLS ── same crew as the cash log: owner + bookkeeper + front desk.
alter table public.cash_sessions enable row level security;

drop policy if exists cash_sessions_staff_all on public.cash_sessions;
create policy cash_sessions_staff_all on public.cash_sessions for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));
