-- Shop-wide weekly goal (shop home upgrade, 2026-07-11): the number the
-- owner's revenue chart races, same mechanic as the artist goal dial.
alter table public.shops
  add column if not exists goal_weekly_cents integer not null default 0;

notify pgrst, 'reload schema';

-- Column-level grants don't cover columns added later (the shops table uses
-- per-column grants) — without this, the app's save silently 42501s.
grant select (goal_weekly_cents), update (goal_weekly_cents) on public.shops to authenticated;

notify pgrst, 'reload schema';
