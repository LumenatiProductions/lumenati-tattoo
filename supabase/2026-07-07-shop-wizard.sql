-- Lumenati — the SaaS seam grows a front door (2026-07-07).
--
-- THE TEMPLATE DECISION (Scott's question, answered in schema): the Y2K site
-- and the artist "rooms" are LUMENATI'S SKIN, not the product. The product's
-- public layer is the DATA — artist name, bio, photos, live promo, book
-- button — and every retention rail (QR cards, claim links, care pages)
-- deep-links to it. So: `shops.template` picks the skin. Lumenati stays
-- 'y2k' (the bespoke legacy renderer, untouched). Every new shop gets
-- 'standard' — a clean, accent-colored template rendering the SAME
-- room_content rows. More skins later = more templates over one data model;
-- the room editor edits data, so finishing it once benefits every skin.
--
-- New shops live under /s/<shop-slug>/<artist>; Lumenati keeps its root URLs.
-- artists.slug is globally unique, so non-default shops store slugs
-- namespaced as "<shop>--<artist>" and the route reassembles them.
--
-- Run via the Management API, then: notify pgrst, 'reload schema';

alter table public.shops add column if not exists template text not null default 'standard';
alter table public.shops add column if not exists accent   text not null default '#ff1493';
alter table public.shops add column if not exists tagline  text not null default '';
update public.shops set template = 'y2k' where id = '11111111-1111-1111-1111-111111111111';

do $$ begin
  alter table public.shops add constraint shops_template_chk check (template in ('standard','y2k'));
exception when duplicate_object then null; end $$;

-- Public pages read shop branding with the anon key. Column-level grant only
-- (the two-step from the 2026-07-01 lockdown: table-level revoke first, or
-- the column grant is a no-op).
drop policy if exists shops_public_read on public.shops;
create policy shops_public_read on public.shops for select using (true);
revoke select on public.shops from anon;
grant select (id, slug, name, template, accent, tagline) on public.shops to anon;

-- The standard template lists a shop's artists with the anon key; shop_id was
-- not in the 2026-07-01 column grant (it didn't exist yet). Not sensitive.
grant select (shop_id) on public.artists to anon;
