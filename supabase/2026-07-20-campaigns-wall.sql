-- Lumenati — wall artist_campaigns cross-shop reads (2026-07-20)
-- Run: node scripts/apply-sql.mjs supabase/2026-07-20-campaigns-wall.sql
--
-- SECURITY FIX (cross-tenant read), found by scripts/two-shop-breakin.mjs.
-- `campaigns_public_read` was `TO public USING (active)`, so ANY logged-in user
-- (an owner/artist of another shop) could read every shop's active promos
-- (title, offer, pct_off). Low sensitivity (marketing copy), but a crossing.
--
-- The public artist/room pages read active promos with the ANON key
-- (getSupabase(), no session) to render them, so anon still needs the read.
-- Restrict the blanket policy to anon only; authenticated users keep their own
-- shop's campaigns via campaigns_artist_read / campaigns_staff_read (both
-- already scoped to current_shop_id()). Same split as the artists wall.

drop policy if exists campaigns_public_read on public.artist_campaigns;

create policy campaigns_public_read on public.artist_campaigns
  for select to anon
  using (active);
