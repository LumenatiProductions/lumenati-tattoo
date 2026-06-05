-- Lumenati — Social feed schema (Phase 1: manual-submit aggregated wall)
-- Run in the Supabase SQL editor after square-schema.sql (needs my_role/my_artist/is_owner).
--
-- Phase 1 is read-only-ish: an owner or front desk pastes Instagram post URLs and
-- they land here, curated into one wall. The same `social_posts` table is what a
-- later Graph-API or aggregator feed-refresh cron writes into (via service role),
-- so the table shape is the seam — only the `source` and how rows arrive changes.

-- Curated/aggregated artist content. One row per post.
create table if not exists public.social_posts (
  id          text primary key,                 -- Instagram shortcode (dedupes re-submits)
  artist_id   text references public.artists(id) on delete set null, -- null = shop / unattributed; matches the roster picker
  platform    text not null default 'instagram',
  external_id text,                              -- shortcode again, or platform post id
  permalink   text not null,                     -- canonical post URL
  media_url   text,                              -- image / thumbnail to render (null = link-card fallback)
  media_type  text not null default 'image',     -- image | video | carousel
  caption     text not null default '',
  source      text not null default 'manual',    -- manual | graph | aggregator | hashtag (provenance / the seam)
  featured    boolean not null default false,    -- owner-curated: show prominently / queue-eligible later
  posted_at   timestamptz,                       -- when it was posted on IG (null when unknown, e.g. manual)
  submitted_by text,                             -- email of whoever added it (manual route)
  created_at  timestamptz not null default now(),
  fetched_at  timestamptz not null default now()
);
create index if not exists social_posts_artist_idx   on public.social_posts (artist_id);
create index if not exists social_posts_created_idx   on public.social_posts (created_at desc);
create index if not exists social_posts_featured_idx  on public.social_posts (featured);

-- ── RLS ──
-- Read: any signed-in staff can see the wall. (A public wall on the Y2K site
-- would use a separate anon-read policy or a service-role-backed route; left out
-- of Phase 1 — command center only for now.)
-- Write: owner + front desk curate. The feed-refresh cron writes via the
-- service-role client, which bypasses RLS entirely.
alter table public.social_posts enable row level security;

drop policy if exists social_posts_read on public.social_posts;
create policy social_posts_read on public.social_posts for select
  using (public.my_role() in ('owner','frontdesk','bookkeeper','artist'));

drop policy if exists social_posts_curate on public.social_posts;
create policy social_posts_curate on public.social_posts for all
  using (public.my_role() in ('owner','frontdesk'))
  with check (public.my_role() in ('owner','frontdesk'));
