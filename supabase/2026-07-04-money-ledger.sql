-- Lumenati — Canonical money ledger (2026-07-04)
-- One append-only, source-stamped, idempotent record of every dollar in/out.
-- Solves both "single source of truth for money" and "permanent change history".
-- Money model going forward = cash + Stripe only (Square is legacy/migration).
-- Rollout is staged: dual-write alongside the current tables, backfill, then
-- switch reads once totals reconcile to the penny. This migration only ADDS the
-- ledger; it changes nothing about current money display.

begin;

create table if not exists public.ledger (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  occurred_at  timestamptz not null default now(),   -- when the money event happened
  created_at   timestamptz not null default now(),   -- when we recorded it
  created_by   text,                                 -- email / 'stripe' / 'system'
  source       text not null check (source in ('stripe','cash','square')),
  kind         text not null check (kind in
                 ('sale','tip','deposit','deposit_refund','refund','payout','rent','expense','adjustment')),
  direction    text not null check (direction in ('in','out')),
  amount_cents integer not null check (amount_cents >= 0),  -- always positive; direction gives sign
  currency     text not null default 'usd',
  artist_id    text references public.artists(id)  on delete set null,
  client_id    text references public.clients(id)  on delete set null,
  booking_id   text references public.bookings(id) on delete set null,
  external_id  text,                                 -- Stripe PI/charge id etc.
  reverses     uuid references public.ledger(id),    -- correction = new row pointing at the original
  note         text
);

-- Idempotency: an external event (Stripe) can only ever land once. NULLs are
-- distinct, so cash rows (external_id null) are unconstrained; upsert can target
-- this constraint by (source, external_id).
alter table public.ledger drop constraint if exists ledger_source_external_uniq;
alter table public.ledger add constraint ledger_source_external_uniq unique (source, external_id);
create index if not exists ledger_shop_idx     on public.ledger(shop_id);
create index if not exists ledger_artist_idx   on public.ledger(artist_id);
create index if not exists ledger_occurred_idx on public.ledger(occurred_at desc);

-- Append-only: block edits and deletes. Corrections are new reversing rows.
create or replace function public.ledger_no_mutate() returns trigger
  language plpgsql as $$
begin
  raise exception 'ledger is append-only; insert a reversing row instead';
end $$;
drop trigger if exists ledger_block_mutate on public.ledger;
create trigger ledger_block_mutate before update or delete on public.ledger
  for each row execute function public.ledger_no_mutate();

alter table public.ledger enable row level security;

-- Staff see everything; an artist sees only rows attributed to them.
drop policy if exists ledger_read on public.ledger;
create policy ledger_read on public.ledger for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk') or artist_id = public.my_artist());

-- Only staff can hand-enter CASH rows. Card money is written solely by the
-- Stripe webhook (service role, which bypasses RLS) — never by a client.
drop policy if exists ledger_cash_insert on public.ledger;
create policy ledger_cash_insert on public.ledger for insert
  with check (public.my_role() in ('owner','bookkeeper','frontdesk') and source = 'cash');

commit;
