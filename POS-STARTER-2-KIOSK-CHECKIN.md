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

## STATUS

Not started. **Unblocked by Session 1:** the deposit step is now
`POST /api/payments {bookingId, kind:'deposit', amountCents}`, which returns a
non-expiring `/pay/<token>` link to render as a QR (client's phone) or open on
the iPad; the webhook auto-moves the booking deposit to `held`. Build the kiosk
flow around that; do not rebuild payments.

Aim Session 4 (cockpit/automation) here once check-in writes a status the Overview
can surface (e.g. "3 checked in, 1 waiting").
