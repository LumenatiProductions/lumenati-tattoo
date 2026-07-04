-- Lumenati — ledger_sales view (2026-07-04, revised after the bug sweep)
-- Presents the canonical ledger as sales-shaped rows so the app reads money from
-- the ledger exactly like the old `sales` table (one row per sale, svc+tip
-- grouped). security_invoker=true so the ledger's RLS applies to the caller.
--
-- BUG-SWEEP FIX: excludes any ORIGINAL row that has been reversed (a refund /
-- deleted cash / correction inserts a reversing row pointing at it via
-- `reverses`). Without this, reversed money kept counting forever.

create or replace view public.ledger_sales with (security_invoker = true) as
select
  regexp_replace(external_id, '_(svc|tip)$', '') as id,
  min(occurred_at) as created_at,
  coalesce(sum(amount_cents) filter (where kind = 'sale'), 0)::int as service_cents,
  coalesce(sum(amount_cents) filter (where kind = 'tip'), 0)::int  as tip_cents,
  case when source = 'cash' then 'cash' else 'card' end as method,
  max(artist_id) as artist_id
from public.ledger
where kind in ('sale','tip') and direction = 'in' and reverses is null and external_id is not null
  and id not in (select reverses from public.ledger where reverses is not null)
group by regexp_replace(external_id, '_(svc|tip)$', ''), source;

grant select on public.ledger       to anon, authenticated, service_role;
grant select on public.ledger_sales to anon, authenticated, service_role;
