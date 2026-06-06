-- Lumenati — Inventory schema (consumable supplies + reorder thresholds)
-- Run in the Supabase SQL editor after square-schema.sql (needs my_role/is_owner).
--
-- The stuff a shop burns through every session — needles, ink, gloves, tubes,
-- aftercare, disposables — tracked with a per-item reorder threshold so you stop
-- discovering you're out mid-tattoo. The nightly job emails the owner everything
-- at or below `reorder_at`. `inventory_log` is an optional audit trail of who
-- changed stock and why (received a shipment, used during a session, count fix).

create table if not exists public.inventory_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default 'other',  -- needle | ink | glove | tube | aftercare | disposable | other
  brand        text,
  color        text,                            -- ink color (null for non-inks)
  unit         text not null default 'each',    -- each | box | bottle
  qty          numeric not null default 0,
  reorder_at   numeric not null default 0,      -- alert threshold (qty <= this flags low)
  reorder_qty  numeric not null default 0,      -- suggested amount to reorder
  cost_cents   integer not null default 0,      -- unit cost in cents (for spend reporting)
  supplier     text,
  supplier_url text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists inventory_items_category_idx on public.inventory_items (category);
create index if not exists inventory_items_name_idx     on public.inventory_items (name);

-- Optional audit trail: every stock change (a +/- adjust or a count fix) appends
-- a row. `delta` is signed (+ received, - used). Kept for "who burned through the
-- gloves" questions; the page works without ever reading it.
create table if not exists public.inventory_log (
  id        uuid primary key default gen_random_uuid(),
  item_id   uuid references public.inventory_items(id) on delete cascade,
  delta     numeric not null default 0,
  reason    text not null default '',
  by_email  text,
  at        timestamptz not null default now()
);

create index if not exists inventory_log_item_idx on public.inventory_log (item_id, at desc);

-- ── RLS ──
-- Read + write: owner / front desk run the supply closet. The nightly low-stock
-- alert writes nothing — it only reads — but uses the service-role client anyway,
-- which bypasses RLS.
alter table public.inventory_items enable row level security;
alter table public.inventory_log   enable row level security;

drop policy if exists inventory_items_staff_read on public.inventory_items;
create policy inventory_items_staff_read on public.inventory_items for select
  using (public.my_role() in ('owner','frontdesk'));

drop policy if exists inventory_items_staff_write on public.inventory_items;
create policy inventory_items_staff_write on public.inventory_items for all
  using (public.my_role() in ('owner','frontdesk'))
  with check (public.my_role() in ('owner','frontdesk'));

drop policy if exists inventory_log_staff_read on public.inventory_log;
create policy inventory_log_staff_read on public.inventory_log for select
  using (public.my_role() in ('owner','frontdesk'));

drop policy if exists inventory_log_staff_write on public.inventory_log;
create policy inventory_log_staff_write on public.inventory_log for all
  using (public.my_role() in ('owner','frontdesk'))
  with check (public.my_role() in ('owner','frontdesk'));
