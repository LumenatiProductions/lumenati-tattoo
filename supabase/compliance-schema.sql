-- Lumenati — Compliance schema (licenses, certs, permits, inspections, insurance)
-- Run in the Supabase SQL editor after square-schema.sql (needs my_role/my_artist/is_owner).
--
-- The dated paperwork that keeps the shop legal: each artist's tattoo license and
-- bloodborne-pathogen (BBP) certification, plus shop-level permits, inspections,
-- and liability insurance. The nightly job recomputes `status` from `expires_on`
-- and emails the owner anything lapsing within 30 days — a failed health-dept
-- inspection turns on exactly this paperwork being current.

create table if not exists public.compliance_items (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null,                    -- artist | shop
  artist_id    text references public.artists(id) on delete cascade, -- null when scope = shop
  kind         text not null,                    -- tattoo_license | bbp_cert | shop_permit | inspection | insurance
  label        text,                             -- free-text override (e.g. "City of Denver tattoo permit")
  issued_on    date,
  expires_on   date,                             -- null = no expiry tracked (status stays 'na')
  document_url text,                             -- optional scan link (Supabase Storage / Drive)
  status       text not null default 'active',   -- active | expiring | expired | na (cron-maintained)
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists compliance_items_artist_idx  on public.compliance_items (artist_id);
create index if not exists compliance_items_expires_idx on public.compliance_items (expires_on);
create index if not exists compliance_items_status_idx  on public.compliance_items (status);

-- ── RLS ──
-- Owner only — this is sensitive (license numbers, insurance, inspection results).
-- The nightly job writes `status` via the service-role client, which bypasses RLS.
alter table public.compliance_items enable row level security;

drop policy if exists compliance_owner_read on public.compliance_items;
create policy compliance_owner_read on public.compliance_items for select
  using (public.my_role() = 'owner');

drop policy if exists compliance_owner_write on public.compliance_items;
create policy compliance_owner_write on public.compliance_items for all
  using (public.my_role() = 'owner')
  with check (public.my_role() = 'owner');
