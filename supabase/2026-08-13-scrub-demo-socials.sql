-- lum-015: the App Review demo artists' public rooms linked out to real
-- third-party socials (tiktok.com/@samrivera.ink, samrivera.ink) for a fake
-- artist. Clear the socials on every apple-review (demo) artist so the review
-- tenant never points at a real external account. Demo data only; idempotent.
update room_content
set socials = null, updated_at = now()
where artist_id in (
  select a.id from artists a
  join shops s on s.id = a.shop_id
  where s.slug = 'apple-review'
);
