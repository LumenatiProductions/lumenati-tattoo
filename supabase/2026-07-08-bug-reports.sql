-- Bug reports (product feedback with an optional screenshot). Internal to the
-- Lumenati product team, NOT a tenant table: it collects reports across every
-- shop, so it is deliberately NOT shop-scoped and NOT readable by shop staff.
-- RLS is ON with no policies -> anon and authenticated are denied entirely;
-- only the service-role API route (/api/bugs) reads and writes it.
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_email text,
  reporter_role text,
  shop_id uuid,
  surface text,                 -- 'web' | 'ios' | 'android'
  url text,                     -- route/path the reporter was on
  note text not null,
  screenshot_path text,         -- object path in the private bug-reports bucket
  user_agent text,
  meta jsonb,
  status text not null default 'new'  -- new | triaged | fixed | wontfix
    check (status in ('new','triaged','fixed','wontfix'))
);
create index if not exists bug_reports_status_idx on public.bug_reports (status, created_at desc);
alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated;

-- Private bucket for the screenshots (may show client PII / money on screen).
insert into storage.buckets (id, name, public)
values ('bug-reports', 'bug-reports', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
