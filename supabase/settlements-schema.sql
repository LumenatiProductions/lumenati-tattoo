-- Lumenati — Artist settlements (makes Payouts "Mark settled" real)
-- Run in the Supabase SQL editor. Needs my_role() (square-schema.sql).
--
-- A settlement records "we squared up with this artist through DATE": the shop
-- wrote the artist a check (net > 0) or the artist paid the shop its cut
-- (net < 0). The Payouts page then computes each artist's statement only from
-- sales AFTER their latest settled_through, so settled rows stop reappearing.

create table if not exists public.settlements (
  id              uuid primary key default gen_random_uuid(),
  artist_id       text not null references public.artists(id) on delete cascade,
  settled_through date not null default current_date, -- statement covers sales up to and including this date
  amount_cents    integer not null,                   -- >0 shop paid artist, <0 artist paid shop
  method          text not null default 'other',      -- check | cash | stripe | other
  note            text not null default '',
  created_by      text,                               -- staff email
  created_at      timestamptz not null default now()
);

create index if not exists settlements_artist_idx on public.settlements (artist_id, settled_through desc);

-- ── RLS ── owner + bookkeeper settle; an artist can read their own history.
alter table public.settlements enable row level security;

drop policy if exists settlements_books_all on public.settlements;
create policy settlements_books_all on public.settlements for all
  using (public.my_role() in ('owner','bookkeeper'))
  with check (public.my_role() in ('owner','bookkeeper'));

drop policy if exists settlements_artist_read on public.settlements;
create policy settlements_artist_read on public.settlements for select
  using (artist_id = public.my_artist());
