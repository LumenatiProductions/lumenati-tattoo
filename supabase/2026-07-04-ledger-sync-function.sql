-- Lumenati — sync_sales_to_ledger() (2026-07-04, from the bug sweep)
-- Square sync writes only the `sales` table; reports now read the ledger. This
-- imports any sales rows not yet in the ledger so new Square sales stay visible.
-- Skips lum_% rows (those are Stripe, already written to the ledger as pay_% by
-- settlePayment — importing them would double-count). Idempotent via
-- ON CONFLICT on unique(source, external_id). Called at the end of the Square
-- sync (lib/square/sync.ts).

create or replace function public.sync_sales_to_ledger() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ledger (source, kind, direction, amount_cents, artist_id, occurred_at, created_by, external_id, note)
  select case when s.method = 'cash' then 'cash' else 'square' end, 'sale', 'in', s.service_cents,
    case when exists (select 1 from public.artists a where a.id = s.artist_id) then s.artist_id else null end,
    s.created_at, 'square-sync', 'sale_' || s.id || '_svc', 'from square sync'
  from public.sales s where s.service_cents > 0 and s.id not like 'lum_%'
  on conflict (source, external_id) do nothing;

  insert into public.ledger (source, kind, direction, amount_cents, artist_id, occurred_at, created_by, external_id, note)
  select case when s.method = 'cash' then 'cash' else 'square' end, 'tip', 'in', s.tip_cents,
    case when exists (select 1 from public.artists a where a.id = s.artist_id) then s.artist_id else null end,
    s.created_at, 'square-sync', 'sale_' || s.id || '_tip', 'from square sync'
  from public.sales s where coalesce(s.tip_cents,0) > 0 and s.id not like 'lum_%'
  on conflict (source, external_id) do nothing;
end $$;

grant execute on function public.sync_sales_to_ledger() to authenticated, service_role;
