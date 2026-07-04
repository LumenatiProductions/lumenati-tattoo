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
  Phase 1 (toggle + sync) AND Phase 2 shipped: book/move now soft-warns when the
  slot overlaps the artist's OWN phone calendar (gated to booking yourself via
  profiles.artist_id; never blocks). Polish: pick which calendar to sync into
  (events move over), reinstall dupe guard (events matched by booking id).
  Needs a real-device check (sim blocks taps). Sync-on-push still open.
- **Artist rewards**: `lib/rewards.ts` + RewardsStrip badges on the money home.
- **/book** redirects to /request. Bug sweep run + fixed before a TestFlight build.

## NEXT SESSION — the actual focus (Scott, 2026-07-04)
The theme is GET ORGANIZED MOVING FORWARD. Scott is changing systems + moving
locations and using that to stand this product up as the real system of record.
Two priorities, roughly in order:

1. **Get the full artist roster in.** The platform only has 6 artists
   (elaine, jd, kalypso, moonie, sam, shorty) and NOT ALL CURRENT ARTISTS ARE IN
   YET. "Grey" is at least one missing artist (has 16 Square sales, $1k, 2026).
   Ask Scott for the complete current roster (names, pay type rent/split/hybrid +
   %, contact) and add them. Then map Grey's Square team id -> the new artist so
   his history attributes (the sync re-resolves artist_id on every run).
2. **Complete the money layer so ALL finances live here** (replace QuickBooks).
   In priority order (see the assessment we did):
   - **Profit & Loss view** — one screen: money in (ledger) minus money out
     (expenses + payouts + rent-the-shop-pays) = actual profit, per month/quarter/
     year. Highest value; the ledger already has the income side.
   - **All money OUT, not just supplies** — a simple bills/expenses area with
     recurring items (shop lease, utilities, software) + due dates, so P&L is real.
   - **Sales tax** — nothing tracks tax collected/owed today. Needed if aftercare
     products (or services, per state) are taxable. Add tax capture + a remittance
     figure.
   - **Owner pay / draws** — record money Scott takes out, separate from expenses.
   - **Accountant export** — a full P&L / general-ledger CSV for tax time (1099
     CSV already exists).
   - Smaller: **mark rent paid** (cash/check) on in-house rent invoices;
     Reports **date range picker** back to 2021 (history is in the ledger now but
     the presets only reach Jan 2026); W-2 **Gusto payroll** if any employees.

## Historical data — STAGED, not cut over (2026-07-04)
- Square has 2,467 payments back to 2021; only 39 had ever imported (the sync
  looked back just 31 days on first run). Ran a ONE-TIME full backfill:
  `scripts/square-full-backfill.mjs --commit` -> **2,378 completed sales
  ($701,852 gross) now in `sales` + the ledger**. Idempotent; safe to re-run.
- **Attribution:** J.D. Pruitt is the only continuing artist who used Square
  (~668 sales attributed to `jd`). The other big Square names (Stephanie Moore,
  Gavin Anstey, Connor Hagerty, Louis Chavez) were FLASH-DAY guests / former
  residents — left as shop revenue on purpose, NOT force-mapped to current
  artists. Grey pending (see roster item above).
- Audit tool: `scripts/historical-audit.mjs` (read-only). Clients: 895 (894 from
  Square), ~133 are ghosts (no name + no contact), ~9 duplicate pairs (2 email-
  exact, 7 name). Client de-dupe deferred as low-stakes; `app/api/clients/merge`
  exists when we want it.
- NOT cutting over from Square yet — this just stages the history so the switch
  is painless later.

## What's left
- **External setup (Scott's, gating launch)** — see `docs/owner-setup-checklist.md`:
  Twilio trial upgrade, move email domain + set RESEND_FROM, live Stripe keys +
  webhook secret, legal review of consent copy (then LEGAL_COPY_REVIEWED=true),
  FOLLOWUPS_AUTOSEND=true when ready.
- **Buildable (secondary to the finance + roster focus above)**: calendar
  sync-on-push (needs booking-change push); web Command Center charts; deeper
  security (encrypt consent medical/ID fields); backfill historical held deposits.

## Also shipped 2026-07-04 (second pass)
- **Ticket-refund UI**: Reconciliation page now lists each card payment this
  month with a Refund button (owner/bookkeeper). Uses the existing refund engine
  (reverses split transfers, fixes books + ledger, idempotent). Deposit refunds
  already had their own button on Bookings; unchanged.
- **RLS break-in test**: `node scripts/rls-breakin-test.mjs` acts as an anonymous
  visitor and confirms 21 money/PII/medical tables leak no rows and refuse writes.
  PASSES. It has a control gate: aborts if the anon key is invalid so a bad key
  can't fake a pass.
- **Fixed corrupt local env values**: `.env.local` had four values wrapped in
  quotes with a trailing `\n` (same bug that broke mobile login): the Supabase
  anon key, the Supabase URL, `SQUARE_ACCESS_TOKEN`, and `SQUARE_ENV`. The bad
  anon key made the REST API reject every browser-side read (fell back to mock in
  local dev); the bad Square token (newline in an HTTP header) made every Square
  call throw, so Booth Rent / weekly digest silently failed. Cleaned all four,
  restarted dev; Clients + Booth Rent now show real data. Prod (Vercel env) was
  NOT affected. Swept the whole file + mobile `.env` — no trailing `\n` left.
- **NOTE**: a broad `pkill -f next-server` I ran likely also stopped another
  Next.js dev server that was on port 3000/3001. Lumenati is back on :3002 and
  3000/3001 are free again; restart your other project if it was one of those.

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
