# NEXT SESSION — Lumenati (updated 2026-08-13, end of day)

## Priority 1: TWILIO IS BLOCKED ON THE DOMAIN MOVE

Real text-code sign-in and all automated texts are still off because the A2P
(carrier) campaign isn't approved. Status today:

- The original rejection (consent / call-to-action, error 30909) is **FIXED** —
  the booking-form consent fix cleared it and it stayed cleared.
- It now fails on **privacy policy + terms verification (30908 / 30882)**, and
  it kept failing across 3 resubmits **even after** the exact carrier-required
  legal language was added to /privacy + /terms AND footer links were added on
  /shops (all live). So it's **not the content** — it's the **domain**.
- Carrier vetting won't verify a privacy policy hosted on the shared
  `lumenati-tattoo.vercel.app` address. It needs Lumenati's **own domain**.

**Scott HAS the domain — it's parked at Squarespace and needs to be moved.** He
did NOT want to do the Squarespace move this session. Once the domain is off
Squarespace and pointed at this site (site + /privacy + /terms served from the
real domain), resubmit the campaign and it should clear.

Resubmit mechanics (when the domain is ready): delete + recreate the
`us_app_to_person` on Messaging Service MG3dea28f30c3672131b6f5b0c7a4c8f59,
brand BN7485850b264f392abdcecd181722923a, via the Messaging Compliance API.
Working script: `scratchpad/a2p-resubmit.mjs` (in the last session's scratchpad;
recreate if gone — it POSTs the brand sid + message_flow + samples + STOP/HELP).
Point the message_flow privacy/terms URLs at the new domain.

Until Twilio clears: **email sign-in works**, and the App Review test number
`(500) 555-0100 / 000000` works (Supabase test OTP, no real SMS). Real phone
numbers get nothing.

## What shipped this session (2026-08-13)

The **QA board** (Admin → QA) is the live loop now: **Grok Bot = QA (finds +
verifies), Claude = builder (fixes)**. Grok filed a 28-finding sweep; resolved
**23 done + 2 won't-fix + 3 deferred**. All web fixes deployed. See
[[project_lumenati_qa_board]] for the full ledger and the board mechanics.

- **Native fixes OTA'd to devices** (update group 0cc076cd): view-as-artist
  scoping across 6 app screens (lum-024, verified in Expo web), staff phone
  invite form (lum-025), web module stubs (lum-026), plus the MoneyChart pace
  and statement-rounding fixes that were waiting.
- **Demo socials scrubbed** on prod (lum-015).

## Still open (small)

- **lum-025 staff invite needs a LIVE end-to-end test** before it's trusted:
  add a teammate, have them sign in. The email path is testable now; the
  phone-code path can't be tested until Twilio clears (Priority 1).
- **lum-007** — the P&L rent number = the PARKED money-model reconciliation.
  Scott's call; don't change money calcs unilaterally.
- **lum-021** — /start progress dots: could NOT reproduce from code (dots track
  the same `step` the screens do). Kicked back to Grok to re-verify with a
  screenshot. Board note left.

## Session mechanics

- Web admin: Scott's cookie is on **127.0.0.1:3002** (NOT localhost). Restart
  the dev server at session start (it serves stale compiled routes).
- Verify the phone app on **Expo web :8081**: `cd app-native && npx expo start
  --web` (NO CI=1), sign in with the App Review test number, drive via Chrome.
  Preview ("view as artist") now persists across web reloads (sessionStorage).
- Deploy web per change: `npx vercel deploy --prod --yes` (auto-deploy works,
  but the manual deploy is reliable). OTA the app only on Scott's explicit go.
- Prod DB writes + prod OTA are blocked in auto mode — Scott shift+tabs, or runs
  the command himself with the `!` prefix.
