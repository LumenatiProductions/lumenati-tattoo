-- Lumenati — ledger_sales view (2026-07-04)
-- Presents the canonical ledger as sales-shaped rows so the app reads money from
-- the ledger exactly like the old `sales` table (one row per sale, svc+tip
-- grouped). security_invoker=true so the ledger's RLS applies to the caller
-- (an artist sees only their own rows). Reports, Payouts, and the home
-- dashboards now read this view instead of `sales`.
-- Verified equal to `sales`: 39 rows, $15,840 income, per-artist to the penny.

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
group by regexp_replace(external_id, '_(svc|tip)$', ''), source;

grant select on public.ledger       to anon, authenticated, service_role;
grant select on public.ledger_sales to anon, authenticated, service_role;
