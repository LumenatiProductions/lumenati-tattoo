-- Lumenati — artists scan their own license from the app (bug 0e1b6cd4, 2026-07-11).
-- Two walls come down, carefully:
--   1. compliance_items grows artist policies: an artist can see and maintain
--      the rows about THEMSELVES (their tattoo license, their BBP cert). Shop
--      permits/inspections/insurance stay owner-only.
--   2. a private `compliance-docs` storage bucket holds the scans. The owner
--      sees everything; an artist only touches their own folder. Links are
--      minted as short-lived signed URLs — the bucket is never public.

-- ── compliance_items: artist lane ──
drop policy if exists compliance_artist_read on public.compliance_items;
create policy compliance_artist_read on public.compliance_items for select
  using (
    public.my_role() = 'artist'
    and scope = 'artist'
    and artist_id = public.my_artist()
    and shop_id = (select public.current_shop_id())
  );

drop policy if exists compliance_artist_write on public.compliance_items;
create policy compliance_artist_write on public.compliance_items for all
  using (
    public.my_role() = 'artist'
    and scope = 'artist'
    and artist_id = public.my_artist()
    and shop_id = (select public.current_shop_id())
  )
  with check (
    public.my_role() = 'artist'
    and scope = 'artist'
    and artist_id = public.my_artist()
    and shop_id = (select public.current_shop_id())
  );

-- ── the scans bucket (private) ──
insert into storage.buckets (id, name, public)
values ('compliance-docs', 'compliance-docs', false)
on conflict (id) do nothing;

-- Owner: the whole bucket.
drop policy if exists compliance_docs_owner_all on storage.objects;
create policy compliance_docs_owner_all on storage.objects for all
  using (bucket_id = 'compliance-docs' and public.my_role() = 'owner')
  with check (bucket_id = 'compliance-docs' and public.my_role() = 'owner');

-- Artist: only their own folder (<artist_id>/...).
drop policy if exists compliance_docs_artist_all on storage.objects;
create policy compliance_docs_artist_all on storage.objects for all
  using (
    bucket_id = 'compliance-docs'
    and public.my_role() = 'artist'
    and (storage.foldername(name))[1] = public.my_artist()
  )
  with check (
    bucket_id = 'compliance-docs'
    and public.my_role() = 'artist'
    and (storage.foldername(name))[1] = public.my_artist()
  );

notify pgrst, 'reload schema';
