-- 2026-07-09 booth rent engine (backlog item 4): escalating nudge state.
-- The daily job walks every pending invoice up a fixed ladder (invoice ready,
-- due today, past due, firmer weekly repeats). These two columns are the only
-- state it needs — which rung was last delivered, and when.
alter table public.rent_invoices
  add column if not exists last_nudged_at timestamptz,
  add column if not exists nudge_count integer not null default 0;

notify pgrst, 'reload schema';
