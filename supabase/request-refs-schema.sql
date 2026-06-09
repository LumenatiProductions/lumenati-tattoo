-- Lumenati — Reference images on booking requests
-- Run in the Supabase SQL editor AFTER booking-requests-schema.sql.
--
-- Customers can attach up to 3 reference shots (style, placement, inspiration)
-- to a /request submission. Files live in the public-read `request-refs`
-- bucket; uploads ONLY go through the service-role API route (size + type
-- checked, images downscaled client-side first) — there is deliberately NO
-- public insert policy on the bucket.

insert into storage.buckets (id, name, public)
values ('request-refs', 'request-refs', true)
on conflict (id) do nothing;

drop policy if exists request_refs_read on storage.objects;
create policy request_refs_read on storage.objects
  for select using (bucket_id = 'request-refs');

alter table public.booking_requests
  add column if not exists reference_urls jsonb not null default '[]'::jsonb;
