-- Lumenati — Storage enumeration lockdown, Milestone 1 / hole #3 (2026-07-02)
-- Run in the Supabase SQL editor (or applied via the Management API).
--
-- The `healed-photos` (client healed-tattoo shots) and `request-refs`
-- (client booking reference images) buckets had a public SELECT policy on
-- storage.objects, which let anyone holding the public anon key LIST every
-- object in them (verified: an anon list returned planted objects). These are
-- client-submitted photos, so bulk enumeration is a privacy hole.
--
-- This drops the anonymous listing. Files are still SERVED at their individual
-- unguessable public URLs (randomBytes paths) — needed because approved healed
-- shots are published to the public artist portfolio, and staff views use the
-- stored URLs — but the buckets can no longer be enumerated with the public key.
--
-- FOLLOW-UP (scheduled, larger): move to fully-private buckets + short-lived
-- signed URLs, copying only APPROVED healed shots to the public room-photos
-- bucket. That touches the upload routes, the Social queue display (web + the
-- mobile app), the approve flow, and the booking-request inbox, so it is its
-- own step, to do before real sensitive photos flow at volume.

drop policy if exists healed_photos_read on storage.objects;
drop policy if exists request_refs_read  on storage.objects;
