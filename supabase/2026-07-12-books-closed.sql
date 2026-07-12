-- Close-the-books (Scott, 2026-07-12): an artist can close their books; new
-- bookers for that artist join the waitlist instead of filing a booking
-- request. Reopening points the artist at their waitlist to fill the calendar.
-- Column is public-read like the rest of artists (the public page needs it to
-- swap the Book CTA); writes stay owner/API-only (artists toggle via the
-- Bearer route, not direct RLS).

alter table artists add column if not exists books_closed boolean not null default false;
