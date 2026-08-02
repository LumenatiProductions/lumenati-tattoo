-- Marketing surface: client marketing consent, per-stream send switches, and
-- blast history. All three are SERVER-ONLY (RLS on, zero policies): every read
-- and write goes through owner-gated API routes with the service role, so no
-- client grants and no cross-shop exposure.

alter table public.clients
  add column if not exists marketing_ok boolean not null default false;
alter table public.clients
  add column if not exists marketing_ok_at timestamptz;

-- Consent is expressed on the public booking form, before a client row
-- exists; it rides the request and copies onto the client at accept time.
alter table public.booking_requests
  add column if not exists marketing_ok boolean not null default false;

-- On/off per automated stream that is NOT already covered by
-- followup_templates.enabled (those carry their own switch + lead_days).
-- Absent row = enabled (streams default on; the env master switches still
-- gate real delivery).
create table if not exists public.message_streams (
  shop_id uuid not null references public.shops(id) on delete cascade,
  stream text not null check (stream in ('rent_nudges', 'weekly_summary')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (shop_id, stream)
);
alter table public.message_streams enable row level security;

create table if not exists public.blasts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  segment text not null,
  subject text,
  body text not null,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.blasts enable row level security;
create index if not exists blasts_shop_created_idx on public.blasts (shop_id, created_at desc);
