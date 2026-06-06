# Starter: Inventory (supplies + reorder)

Read `BUILD-PLAN.md` first. Wave 1. No FKs to other features (fully standalone).
A clean first parallel build.

## The idea in one line

Track the consumables a shop burns through — needles, ink, gloves, tubes,
disposables — with reorder thresholds, so you stop discovering you're out mid-
session and making emergency supply runs.

## What exists to build on

Auth/RLS/provider patterns per BUILD-PLAN. Resend + the ops daily route for
low-stock alerts. Optionally tie ink/needle usage to `bookings` later, but the
v1 is just a managed stock list.

## Data model

```
inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'other',     -- needle | ink | glove | tube | aftercare | disposable | other
  brand text, color text,            -- color for inks
  unit text default 'each',          -- each | box | bottle
  qty numeric default 0,
  reorder_at numeric default 0,      -- alert threshold
  reorder_qty numeric default 0,     -- suggested reorder amount
  cost_cents int default 0,          -- unit cost (for spend reporting)
  supplier text, supplier_url text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
)
inventory_log (                      -- optional: who changed stock and why
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete cascade,
  delta numeric, reason text, at timestamptz default now(), by_email text
)
```
RLS: owner/frontdesk read+write. Cron reads for alerts.

## Owned files

`app/admin/(app)/inventory/` · `app/api/inventory/` (CRUD + adjust qty) ·
`lib/admin/inventory-context.tsx` · `supabase/inventory-schema.sql` ·
`runDailyJob` = email owner items at/below `reorder_at`.

## Page sketch

A list grouped by category with qty, a green/amber/red stock badge vs
`reorder_at`, and quick +/- to adjust. A "needs reordering" section at top with
supplier links. Stats: items low, total stock value (qty x cost).

Expose `useInventory().lowStock` for the Overview tile.

## Phases

1. Table + CRUD + quick qty adjust + low-stock badges.
2. Daily low-stock alert email via ops job.
3. Stock-value reporting (feeds Reports as a shop expense line).
4. Later: decrement on use, tied to bookings/sessions.

## External needs from Scott

None to start. A starting inventory list + suppliers would seed it usefully.
