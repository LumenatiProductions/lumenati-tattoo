-- Lumenati — Push notification tokens (POS-STARTER-6, last mile)
-- Run in the Supabase SQL editor.
--
-- One row per device that opted into push. The app upserts its Expo push token
-- on sign-in; the daily ops job (service-role) reads these to nudge the right
-- people (rent due, reorders, expiring licenses, no-show review). `email` is
-- stored so the server can resolve the device's role via `profiles` at send time.

create table if not exists public.device_tokens (
  token      text primary key,            -- ExponentPushToken[...]
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,
  platform   text,                         -- ios | android | web
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

-- ── RLS ── each user manages only their own device rows. The server sends via
-- the service-role client (bypasses RLS).
alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
