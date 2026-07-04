-- Lumenati — One-time ledger backfill from existing `sales` (2026-07-04)
-- Imports historical revenue into the canonical ledger so its totals match the
-- current reports. Source is derived from the sale: 'lum_%' ids = Stripe,
-- method='cash' = cash, everything else = square (legacy). Service and tip are
-- separate rows. Idempotent via ON CONFLICT on the unique (source, external_id).
-- artist_id is only kept when it maps to a real artist (avoids FK errors).

insert into public.ledger (source, kind, direction, amount_cents, artist_id, occurred_at, created_by, external_id, note)
select
  case when s.id like 'lum_%' then 'stripe' when s.method = 'cash' then 'cash' else 'square' end,
  'sale', 'in', s.service_cents,
  case when exists (select 1 from public.artists a where a.id = s.artist_id) then s.artist_id else null end,
  s.created_at, 'backfill', 'sale_' || s.id || '_svc', 'backfill from sales'
from public.sales s
where s.service_cents > 0
on conflict (source, external_id) do nothing;

insert into public.ledger (source, kind, direction, amount_cents, artist_id, occurred_at, created_by, external_id, note)
select
  case when s.id like 'lum_%' then 'stripe' when s.method = 'cash' then 'cash' else 'square' end,
  'tip', 'in', s.tip_cents,
  case when exists (select 1 from public.artists a where a.id = s.artist_id) then s.artist_id else null end,
  s.created_at, 'backfill', 'sale_' || s.id || '_tip', 'backfill from sales'
from public.sales s
where coalesce(s.tip_cents, 0) > 0
on conflict (source, external_id) do nothing;
