# Artist calendar integration — plan

Status: PROPOSED (awaiting scope decision). Idea from Scott, 2026-07-02: let artists
connect their own calendar so shop bookings land in it automatically AND the shop
can see conflicts with their outside schedule.

## Goal
- An artist connects their personal calendar (Google and/or Apple) once.
- Every shop booking for that artist appears on their personal calendar (with a
  reminder), and updates/cancels when the booking changes.
- When staff book or move an appointment, the app warns if it clashes with the
  artist's OUTSIDE (personal) commitments, not just other shop bookings.

## What already exists (don't rebuild)
- In-shop double-booking is already checked: web `/api/bookings` conflict guard and
  mobile `findClash()` in `app-native/app/(app)/bookings.tsx`. The new work is the
  EXTERNAL calendar layer only.

## Scope options
1. **Full two-way (recommended, matches the ask).** OAuth connect to Google
   Calendar (and Apple). Push shop bookings out as events; pull the artist's busy
   times in to flag outside conflicts. Biggest build.
2. **One-way push.** Shop bookings appear on their calendar with reminders; no
   outside-conflict awareness. Simpler.
3. **Subscribe link (ICS).** A private per-artist feed URL they add to any calendar
   app. No sign-in. One-way, slow refresh (hours). Quickest, roughest.

## Two-way design (if chosen)
### Data
- New table `artist_calendar_connections` (tenant-scoped via `shop_id`):
  `artist_id`, `provider` (google|apple), encrypted `access_token`/`refresh_token`,
  `calendar_id`, `sync_token`, `expires_at`, `connected_at`. RLS: an artist manages
  their own row; owner can see connection status (not tokens).
- On `bookings`: add `external_event_id` (the pushed calendar event's id, per
  provider) so updates/cancels map 1:1.

### Google (primary)
- OAuth 2.0, scope `calendar.events` (read+write) + `calendar.readonly` for busy
  lookups. Needs a Google Cloud project + OAuth consent screen (Scott action).
- Push: on booking create/update/cancel, upsert/delete the event via Calendar API.
- Conflict read: `freebusy.query` for the artist's calendar over the proposed slot;
  if busy, surface a soft warning in the booking UI (never a hard block).
- Keep in sync with incremental `syncToken`; refresh tokens server-side.

### Apple
- No simple server OAuth. Two realistic paths:
  - iOS app: native EventKit (ask calendar permission, write events + read busy)
    directly on device. Clean on mobile, but mobile-only.
  - Web/cross-platform: CalDAV with an app-specific password (clunky) — defer.
- Recommendation: Google first (server, works web+mobile), Apple via EventKit in the
  native app as a fast-follow.

### Where it plugs in
- Web: `/api/bookings` create/update/cancel + a "Connect calendar" control on the
  artist's own settings / Artists & Pay.
- Mobile: `app-native/app/(app)/bookings.tsx` (extend `findClash` to also check the
  external busy window) + a connect button in the artist's area.
- A small server module `lib/calendar/` (providers behind one interface) so web +
  mobile share push/conflict logic through the API.

## Effort / phasing
- Phase 1: Google OAuth connect + one-way push (bookings → their calendar). Ship the
  visible win first.
- Phase 2: freebusy conflict warnings on book/move (the "see outside conflicts" part).
- Phase 3: Apple via EventKit in the native app.

## Open decisions (need Scott)
- Scope (1/2/3 above). His description = option 1 (two-way).
- Google-first vs also Apple now.
- Whether outside conflicts are a soft warning (recommended) or a hard block.

## External prerequisites (Scott actions when we build)
- Google Cloud project + OAuth consent screen + client id/secret.
- (Apple/EventKit needs nothing extra beyond the native app.)
