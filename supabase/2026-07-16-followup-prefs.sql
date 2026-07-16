-- Lumenati — Artist-controlled follow-ups (2026-07-16).
-- Run: node scripts/apply-sql.mjs supabase/2026-07-16-followup-prefs.sql
--
-- Today a follow-up's timing + copy is one shop-wide template per kind, owner-
-- only. This lets each ARTIST override the timing (lead_days) and copy (subject/
-- body) of their OWN follow-ups, inheriting the shop default until they change
-- it. A follow-up is tied to a booking, which is tied to an artist, so we tag
-- each follow-up with its artist and resolve: artist override -> shop template
-- -> code default (lib/followups/templates.ts). Only the visit-tied kinds are
-- artist-controllable (rebook/birthday aren't one artist's visit).

-- Tag each follow-up with the artist it belongs to, so both scheduling and
-- sending can resolve that artist's timing + copy. Nullable + backfill-free:
-- existing rows stay null and fall back to the shop/default template.
alter table public.followups add column if not exists artist_id text references public.artists(id) on delete set null;
create index if not exists followups_artist_idx on public.followups (artist_id);

-- Per-artist per-kind overrides. Every override column is NULLABLE: null means
-- "inherit the shop default for this field". A missing row = fully inherited.
create table if not exists public.followup_prefs (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  artist_id   text not null references public.artists(id) on delete cascade,
  kind        text not null,
  subject     text,      -- null = inherit
  body        text,      -- null = inherit
  lead_days   int,       -- null = inherit
  enabled     boolean,   -- null = inherit
  updated_at  timestamptz not null default now(),
  constraint followup_prefs_kind_chk
    check (kind in ('aftercare','review_request','healed_photo','reminder_48h','reminder_24h')),
  constraint followup_prefs_uniq unique (artist_id, kind)
);
create index if not exists followup_prefs_artist_idx on public.followup_prefs (artist_id);
create index if not exists followup_prefs_shop_idx   on public.followup_prefs (shop_id);

-- ── RLS ──
-- An artist manages their OWN rows; an owner manages any in their shop. The
-- daily job + the save API read/write via the service-role client (bypasses RLS)
-- and scope explicitly.
alter table public.followup_prefs enable row level security;

drop policy if exists followup_prefs_rw on public.followup_prefs;
create policy followup_prefs_rw on public.followup_prefs for all
  using (
    artist_id = public.my_artist()
    or (public.is_owner() and shop_id = public.current_shop_id())
  )
  with check (
    artist_id = public.my_artist()
    or (public.is_owner() and shop_id = public.current_shop_id())
  );

grant select, insert, update, delete on public.followup_prefs to authenticated;
