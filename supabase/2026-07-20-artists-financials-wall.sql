-- Lumenati — wall artist financials to the caller's own shop (2026-07-20)
-- Run: node scripts/apply-sql.mjs supabase/2026-07-20-artists-financials-wall.sql
--
-- SECURITY FIX (cross-tenant read). The `artists` table carried a single
-- SELECT policy `artists_public_read USING (true)` for ALL roles. The anon key
-- is column-locked to safe display columns (security-lockdown.sql), but the
-- `authenticated` role kept a full-table SELECT grant, so ANY logged-in user
-- (an artist or owner of any shop) could read EVERY shop's private business
-- terms: rent_cents, split_pct, pay_type, stripe_account_id, stripe_onboarded,
-- books_closed.
--
-- RLS is row-level and grants are column-level, so we can't hand "safe columns
-- to everyone, financial columns to own-shop only" to a single role in one
-- policy. Instead we split the read policy by role:
--   anon           -> USING (true), still column-locked to safe display cols.
--                     Public artist/room pages keep working across shops.
--   authenticated  -> USING (shop_id = current_shop_id()). A logged-in user only
--                     sees their own shop's rows (all granted columns), so the
--                     financial columns are reachable only for their own shop.
-- The React Native app reads via the service-role client (Bearer path), which
-- bypasses RLS, so it is unaffected. `artists_owner_write` (ALL, own-shop) is
-- left as-is and continues to cover owner writes + own-shop reads.

drop policy if exists artists_public_read on public.artists;

create policy artists_read_anon on public.artists
  for select to anon
  using (true);

create policy artists_read_authenticated on public.artists
  for select to authenticated
  using (shop_id = (select current_shop_id()));
