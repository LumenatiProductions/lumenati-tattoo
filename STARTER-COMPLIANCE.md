# Starter: Compliance (licenses, certs, permits)

Read `BUILD-PLAN.md` first. Wave 1. FKs to `artists` only. Small, standalone,
high-value — health-dept inspections fail on exactly this.

## The idea in one line

Track the dated paperwork that keeps the shop legal: each artist's tattoo
license and bloodborne-pathogen (BBP) certification, plus shop-level permits and
inspections — and warn before anything expires.

## What exists to build on

Auth/RLS/provider patterns per BUILD-PLAN. Resend for expiry reminder emails via
the ops route.

## Data model

```
compliance_items (
  id uuid primary key default gen_random_uuid(),
  scope text not null,               -- artist | shop
  artist_id text references public.artists(id) on delete cascade, -- null when scope=shop
  kind text not null,                -- tattoo_license | bbp_cert | shop_permit | inspection | insurance
  label text,
  issued_on date, expires_on date,
  document_url text,                 -- optional scan link
  status text default 'active',      -- active | expiring | expired | na
  notes text default '',
  created_at timestamptz default now()
)
```
RLS: **owner only** (sensitive). Cron writes status via service role.

## Owned files

`app/admin/(app)/compliance/` · `app/api/compliance/` (CRUD) ·
`lib/admin/compliance-context.tsx` · `supabase/compliance-schema.sql` ·
`runDailyJob` = recompute `status` from `expires_on` (expiring within 30 days)
and email the owner what's lapsing.

## Page sketch

A table grouped by artist + a shop section, each row showing kind, expiry, and a
colored badge (green active / amber expiring / red expired). A top "expiring
within 30 days" callout. Stats: items tracked, expiring soon, expired.

Expose `useCompliance().expiringSoon` for the Overview tile (this is the most
valuable Overview surface — it prevents a failed inspection).

## Phases

1. Table + manual entry per artist + shop, with the expiry badge logic.
2. Daily status recompute + owner email for anything within 30 days.
3. Optional document scan links (Supabase Storage).

## External needs from Scott

The list of what's tracked and current expiry dates (artist licenses, BBP certs,
shop permit, liability insurance, last inspection). Local renewal cadence if it
differs from annual.
