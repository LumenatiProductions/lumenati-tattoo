-- Shop logo (Scott, 2026-07-12): shows on resident artists' hosted pages
-- (the shop's quiet presence on pages we host — NOT a shop website feature).
-- shops carries per-column grants, so the new column needs its own.
alter table public.shops add column if not exists logo_url text;

grant select (logo_url) on public.shops to anon, authenticated;
grant update (logo_url) on public.shops to authenticated;

notify pgrst, 'reload schema';
