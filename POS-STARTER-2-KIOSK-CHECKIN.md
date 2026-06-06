# POS Starter 2: Kiosk self check-in (locked iPad)

Read `POS-BUILD-PLAN.md` first. Pure web. Depends on existing intake/bookings and
on Session 1 for the optional deposit step. This is what runs full-screen on a
Guided-Access iPad at the front desk.

## The idea in one line

A client walks in, taps their appointment on the iPad, confirms their details,
signs their consent form, and (optionally) pays a deposit, with no front-desk
keystrokes.

## What exists to build on

`bookings` (today's appointments), `clients`, and the draw-to-sign
`consent_forms` intake flow are all built. The kiosk assembles these into one
locked, touch-first flow. Session 1's `POST /api/payments` provides the deposit
step. Nothing new in the data model.

## Owned files

`app/kiosk/page.tsx` and `app/kiosk/layout.tsx` (its own full-screen layout, no
admin nav) · `app/kiosk/` step components · `lib/kiosk/` (today's-appointments
fetch + check-in state machine) · a kiosk-scoped API under `app/api/kiosk/` that
exposes ONLY today's bookings + check-in writes, gated by a device token (not a
user login, since the iPad is shared and not signed in as a person).

## Page sketch

A big, glanceable list of today's appointments by time. Tap one ->
confirm name/phone (prefilled, editable) -> sign consent (reuse the existing
canvas signer) -> "All set" (and, if a deposit is due, a "Pay now" handoff to
Session 1's portal, or "pay at desk"). Auto-resets to the appointment list after
each client. Idle screen / Lumenati attract loop between clients.

## Locking the iPad (no code)

Guided Access pinned to `/kiosk` in Safari for one device; MDM Single App Mode for
several. Documented here, not built.

## Phases

1. Today's-appointments list + tap-to-check-in + confirm details + mark
   `status` checked-in. No payment yet.
2. Consent signing inline (reuse intake canvas), stored against the booking.
3. Deposit handoff to Session 1 (`/pay/[token]` on the same iPad or the client's phone via QR).
4. Idle/attract screen + auto-reset + a kiosk "device token" so the iPad authorizes without a personal login.

## External needs from Scott

One iPad to test Guided Access on. Decide whether the kiosk also collects
walk-ins (no appointment) or only checks in booked clients to start.

## STATUS — built (2026-06-05), awaiting KIOSK_DEVICE_TOKEN

Phases 1–3 shipped, plus a lite Phase 4 (device token + auto-reset). Dormant
until Scott sets `KIOSK_DEVICE_TOKEN`; until then `/kiosk` shows a "not set up"
screen and `/api/kiosk` returns 503.

**Plan change (recorded):** check-in could NOT reuse `status` —
`bookings.status` has a CHECK constraint (scheduled/completed/no_show/cancelled)
and other features depend on it. So check-in is an additive
`bookings.checked_in_at timestamptz` (new `supabase/kiosk-schema.sql`, APPLIED;
append-only, does not edit bookings-schema.sql). A booking stays `scheduled`
until it completes; `checked_in_at` just means "they're here."

- `supabase/kiosk-schema.sql` — APPLIED (the `checked_in_at` column + index).
- `app/api/kiosk/route.ts` — device-token gated (`x-kiosk-token` vs
  `KIOSK_DEVICE_TOKEN`), service-role. GET ?date= returns today's bookings
  enriched with client name/phone, artist, deposit, check-in + consent state.
  POST actions: `checkin` (optional client edits + stamp `checked_in_at`),
  `deposit` (reuses Session 1 `createPaymentLink`).
- `lib/kiosk/api.ts` — browser token storage + fetch wrappers (today = the
  iPad's own local date, so "today" is the shop's day).
- `app/kiosk/` — full-screen touch flow (its own layout + scoped `kiosk.css`):
  setup → today's list → confirm details → checked-in. Consent reuses the
  existing `/intake/<token>` signer (a "Sign your consent form" link when an
  unsigned form exists). Deposit opens Session 1's `/pay/<token>` on the iPad.
  30s auto-reset back to the list.
- `npm run build` green.

**Not yet:** QR-to-the-client's-phone for the deposit (today it opens `/pay` on
the iPad itself); an attract/idle animation; on-the-fly consent-form creation
(kiosk only signs forms intake already created). Provision: set
`KIOSK_DEVICE_TOKEN`, open `/kiosk` on the iPad, enter that code once, then lock
with Guided Access.

### Aimed at Session 4 (cockpit)
Check-in now persists as `bookings.checked_in_at`. Surface it on the Overview as
"N checked in" / waiting, and the no-show automation can read it (a booking past
its slot with no `checked_in_at` and a `held` deposit is the forfeit candidate).
