-- Merch at the POS (applied 2026-07-05 via Management API).
--
-- An inventory item with a retail price IS a sellable product — no separate
-- catalog table. price_cents null = supplies (not for sale); set = shows up
-- as a quick-tap button on the POS (phone app + web cash page).
alter table public.inventory_items
  add column if not exists price_cents integer;

-- Card merch sales ride the existing Tap to Pay payments row. The charge total
-- is products + sales tax; amount_cents stays the NET (products) amount so the
-- ledger sale row stays net-of-tax like the cash path. tax_cents becomes its
-- own ledger 'tax' row on settle; items (jsonb [{id,name,qty,price_cents}]) is
-- what was sold, so settle can decrement stock.
alter table public.payments
  add column if not exists tax_cents integer not null default 0;
alter table public.payments
  add column if not exists items jsonb;

notify pgrst, 'reload schema';
