# Artist calendar integration — plan (phone-native)

Status: SCOPE DECIDED — full two-way, phone-native (Scott, 2026-07-02).
Artists are phone-only, so we integrate with the iPhone's own Calendar (EventKit
via `expo-calendar`), NOT a Google server OAuth. iOS Calendar already aggregates
the artist's iCloud + Google + any other accounts, so one native integration
covers all of them, with no Google Cloud project and no server-stored OAuth tokens.

## Goal
- Artist grants calendar access once (one iOS permission prompt).
- Every shop booking for that artist is written to their phone calendar, and stays
  in sync when the booking changes or cancels.
- When staff book or move an appointment, warn about clashes with the artist's
  OUTSIDE commitments (read from all their phone calendars over the slot).

## What already exists (don't rebuild)
- In-shop double-booking check: web `/api/bookings` + mobile `findClash()`.
- The new work is the phone-calendar (EventKit) layer.

## Approach: `expo-calendar` (EventKit), on-device
- Add `expo-calendar`; rebuild the dev/EAS client (native module).
- Permission: `Calendar.requestCalendarPermissionsAsync()`.
- Choose target calendar: default to the artist's primary; let them pick in a
  small settings row (writable calendars via `getCalendarsAsync`).
- **Write:** on sync, upsert an event per booking (title, artist, service, start/
  end, location = shop). Tag each event with the booking id (in `notes`/`url`) so
  we can find + update/cancel it later without server-stored device ids.
- **Conflict read:** before confirming a new/moved slot, `getEventsAsync` across
  the artist's calendars over the window; if busy, show a soft warning (never a
  hard block).
- **Sync trigger:** reconcile on app foreground + when a booking-change push
  arrives. (Phone-only artists don't need server push to their calendar.)

## Where it plugs in (mobile app)
- `app-native/app/(app)/bookings.tsx`: extend `findClash` to also check the phone
  calendar; add "Add to my calendar" / connection state.
- A `lib/calendar.ts` module: permission, pick calendar, upsert/delete event by
  booking id, freebusy check. Keep it self-contained.
- Artist settings: a "Calendar sync" toggle + which calendar.

## Data (minimal)
- Likely NO server schema needed for v1: events are matched on-device by booking
  id embedded in the event. If we later want cross-device/reinstall robustness,
  add a mapping table then.

## Phasing
- Phase 1: permission + write bookings to the phone calendar (the visible win).
- Phase 2: outside-conflict warnings on book/move.
- Phase 3: polish (calendar picker, sync-on-push, dupe guards on reinstall).

## Optional later (NOT now)
- Server-side Google OAuth: only if bookings must land in an artist's calendar
  when their phone isn't involved (e.g., web-only admin flows). Deferred; the
  phone-native path covers the artist reality today.

## Open decisions
- Soft warning vs hard block on outside conflicts (recommend soft warning).
