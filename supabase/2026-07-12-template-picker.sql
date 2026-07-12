-- Templates part two (2026-07-12): two new skins join 'standard', and shops
-- pick theirs from the app (Staff screen, admin only — same pattern as the
-- logo card, which is why the update grant mirrors logo_url's).
--   'dark'  = dark ink: heavier atmosphere, blackwork energy, same data.
--   'flash' = flash sheet: the wall of flash IS the page.
-- 'y2k' stays Lumenati-only and is never offered by the picker.
alter table public.shops drop constraint if exists shops_template_chk;
alter table public.shops add constraint shops_template_chk
  check (template in ('standard', 'dark', 'flash', 'y2k'));

grant update (template) on public.shops to authenticated;

notify pgrst, 'reload schema';
