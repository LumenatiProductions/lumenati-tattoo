-- Early-warning system: one row per operational failure so a real shop's broken
-- flow (a failed payment, a text that didn't send, a webhook error, an app
-- crash) surfaces on the owner Health page instead of dying silently. Written by
-- lib/ops-events.ts (service role, best-effort). Server-only: RLS on, zero
-- policies — the owner reads through /api/health with the service role, scoped
-- to their shop.

create table if not exists public.ops_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  kind text not null,        -- payment_failed | dispute | sms_failed | email_failed | webhook_error | cron_error | client_error
  severity text not null default 'warn' check (severity in ('info', 'warn', 'error')),
  summary text not null,     -- one-line, human: "Text to a client failed"
  detail text,               -- longer context / clipped stack
  created_at timestamptz not null default now(),
  resolved_at timestamptz    -- owner marked it handled
);
alter table public.ops_events enable row level security;

create index if not exists ops_events_shop_created_idx on public.ops_events (shop_id, created_at desc);
create index if not exists ops_events_created_idx on public.ops_events (created_at desc);

notify pgrst, 'reload schema';
