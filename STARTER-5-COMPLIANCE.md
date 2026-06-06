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

## STATUS

Built (2026-06-05). `npm run build` green.

**Shipped — Phases 1 & 2** (Phase 3 / Supabase Storage uploads deferred; the
`document_url` column + a "scan" link are already wired, so a pasted URL works
today — only the in-app upload is left):

- `supabase/compliance-schema.sql` — `compliance_items` table per spec.
  `artist_id` FK `on delete cascade` (an artist's paperwork goes when they do).
  Indexes on `artist_id`, `expires_on`, `status`. RLS: **owner only** r+w
  (`my_role() = 'owner'`); the nightly job writes `status` via the service-role
  client (bypasses RLS). Apply this in Supabase before the page will load data.
- `app/api/compliance/route.ts` — owner-only CRUD (GET list soonest-expiry-first,
  POST, PATCH, DELETE). Status is computed from `expires_on` on every write via
  the shared `computeStatus`, so a new/edited item is badge-correct immediately
  without waiting for the cron. 401 unauthenticated / 403 non-owner.
- `lib/admin/compliance-context.tsx` — full provider with `addItem` /
  `updateItem` / `removeItem` + `refresh`. Exposes **`useCompliance().expiringSoon`**
  (expiring + expired, soonest first) for the Overview integration pass. A 403
  (non-owner) is treated as an empty state, not an error.
- `app/admin/(app)/compliance/page.tsx` — stats (tracked / expiring / expired),
  a top "needs attention" callout, an add-item form, and a table grouped by
  artist + a shop section, each row showing kind, issued/expires, a days-left
  note, a colored status badge, and a scan link when present.
- `lib/compliance/job.ts` (`runDailyJob`, imported by `/api/ops/daily`) —
  recomputes every item's `status` from `expires_on` (only writing rows that
  changed), then emails the owner everything lapsing within 30 days, most-overdue
  first. Email is best-effort: gated on `RESEND_API_KEY`; if unset, statuses
  still update and only the email is skipped. Recipients come from
  `DIGEST_RECIPIENTS` (defaults to `lumenati@icloud.com`), matching the weekly
  digest.

Status logic (`EXPIRY_WINDOW_DAYS = 30`): no expiry → `na`; past → `expired`;
within 30 days → `expiring`; else `active`.

**Left for the integration pass:** compose `useCompliance().expiringSoon` into
the Overview tile (single-owner pass per BUILD-PLAN). **Phase 3:** swap the
`document_url` text field for a Supabase Storage upload.
