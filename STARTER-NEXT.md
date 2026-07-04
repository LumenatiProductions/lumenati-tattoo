# Lumenati — next-session starter

Read this first in a fresh context. Scott is NOT a coder: explain in plain
English, no jargon/file paths in chat. Never use emojis or em dashes.

## What this is
A tattoo-shop management product Lumenati owns end to end, replacing Square (POS)
and QuickBooks (books). Two surfaces, ROLE-BASED (not full parity):
- **Web Command Center** (`/admin`, Next.js, dev on :3002) = whoever runs the
  shop (owner/front desk/bookkeeper). Heavy admin.
- **Phone app** (`app-native`, Expo) = ARTISTS (phone-only) + owner on the go.
Public site is the Y2K marketing/booking layer. Owner login: lumenati@icloud.com.

## Money model
Cash + Stripe only. Square is being REMOVED (Stripe Tap-to-Pay replaces its
terminals). Everything runs through the canonical **ledger** (see below).

## Shipped this session (2026-07-04)
- **Security**: closed 4 live holes (public write to room pages/storage, artists'
  private terms readable by anon, admin door checked login not staff, anon
  enumeration of client-photo buckets). Verified with live probes.
- **Multi-shop seam**: `shops` table + `shop_id` (default Lumenati) on all 26
  tenant tables + `current_shop_id()`. One-shop-now, SaaS-later without a rewrite.
- **Money ledger** (the big one): append-only, source-stamped, idempotent
  `public.ledger`; dual-write from Stripe (settlePayment) + cash; backfilled;
  reconciled to the penny; Reports/Payouts/dashboards read it via the
  `ledger_sales` view. Refunds/deletes net out; new Square sales imported via
  `sync_sales_to_ledger()`.
- **Retention + texting**: follow-up engine already existed; wired Twilio
  (Auth Token added, verified) so texts work; env-driven email sender;
  autosend fires on SMS OR email. Trial Twilio (needs upgrade for real numbers).
- **Clients**: ledger-based lifetime value + a "Bring them back" retention panel
  (birthdays / due-to-rebook / lapsed).
- **Calendar**: phone-native (expo-calendar) sync of bookings + conflict reader.
  Phase 1 (toggle + sync) shipped; conflict warnings in book/move flow are next.
- **Artist rewards**: `lib/rewards.ts` + RewardsStrip badges on the money home.
- **/book** redirects to /request. Bug sweep run + fixed before a TestFlight build.

## What's left
- **External setup (Scott's, gating launch)** — see `docs/owner-setup-checklist.md`:
  Twilio trial upgrade, move email domain + set RESEND_FROM, live Stripe keys +
  webhook secret, legal review of consent copy (then LEGAL_COPY_REVIEWED=true),
  FOLLOWUPS_AUTOSEND=true when ready.
- **Buildable**: calendar conflict warnings (Phase 2) + Apple EventKit polish;
  ticket-refund UI (engine exists, no button); Gusto payroll (needs Gusto acct);
  web Command Center charts; deeper security (encrypt consent medical/ID fields,
  RLS break-in test); backfill historical held deposits.

## How to work
- Web dev: `cd ~/lumenati-tattoo && npm run dev` (lands on :3002; 3000/3001 taken).
- Mobile: EAS builds to TestFlight (already set up, `eas build -p ios --profile
  production --auto-submit`); local sim via `expo run:ios`. Sim BLOCKS synthetic
  taps (keystrokes work, clicks don't) — verify artist views on a real device.
- DB: run SQL via Supabase Management API, project ref humjddiwzzanvvqztypy (see
  memory `reference_lumenati_supabase_db`; PAT expires 2026-07-31). ALWAYS
  `notify pgrst, 'reload schema'` after DDL or reads fall back to mock.
- Deploy: pushing to main auto-deploys web to Vercel.
- Verify money changes to the penny; verify UI in Chrome (localhost:3002).
