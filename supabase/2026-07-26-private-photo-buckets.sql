-- Private photos (2026-07-26). healed-photos + request-refs stop serving
-- publicly: staff surfaces exchange stored PATHS for short signed URLs minted
-- server-side, and an APPROVED healed shot is copied into the public
-- room-photos bucket at approve time (the public portfolio is the only thing
-- that needs a no-auth URL). Both buckets and their tables were EMPTY at
-- cutover (verified 2026-07-26), so healed_photos.url and
-- booking_requests.reference_urls simply carry paths from here on — no
-- backfill, no column renames (renames would break shipped app builds).
update storage.buckets set public = false where id in ('healed-photos', 'request-refs');
