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

## Shipped 2026-07-04 (third pass) — the MONEY LAYER is complete
QuickBooks replacement built and verified to the penny in Chrome:
- **Profit & Loss** (`/admin/pnl`, in the nav): shop income (splits +
  unattributed/shop sales + booth rent from ledger + forfeited deposits) minus
  expenses = profit, by month/quarter/year, any year back to 2021 or all time.
  All-time totals verified against the DB to the cent ($702,352 gross, 2,364
  sales; API paginates past the PostgREST 1000-row cap). Income lines are
  transparent (splits vs no-artist sales split out).
- **Recurring bills** on Expenses: `recurring_expenses` table; add/pause/remove
  bills (lease, utilities, software) with cadence + next-due; "Post due" turns
  them into real expense rows, idempotent per period (unique recurring_id+period),
  due date auto-advances. Verified end to end.
- **Owner draws**: `owner_draws` table + section on the P&L page. Distributions,
  not expenses — below the profit line.
- **Sales tax**: rate lives on shops.sales_tax_bps (editor on the P&L page);
  when set, the Cash Log shows a "Taxable product" checkbox that backs tax out
  of the amount; ledger books sale net of tax + a kind='tax' row; delete
  reverses BOTH rows (verified). Remittance figure on P&L. Rate currently 0 —
  SCOTT MUST SET the real rate (services usually untaxed, aftercare products
  usually taxed — confirm state rules).
- **Accountant exports**: P&L CSV + full general-ledger CSV buttons on the P&L
  page (server-side, paginated, penny-exact).
- **Mark rent paid (cash/check)** buttons on in-house rent invoices — marks
  paid + books a ledger rent row idempotently. Built, NOT live-tested (didn't
  want to fabricate a real rent payment); same upsert pattern as the verified
  flows. Test with the first real cash rent.
- **Reports year picker** now reaches 2021.
- DB migration: `supabase/2026-07-04-money-out.sql` (applied to live DB; also
  adds 'tax'/'draw' ledger kinds).
- **Categorized nav** (Scott's ask): web sidebar grouped into Front of house /
  Finances / Shop / Admin; the app's home "Go to" tiles grouped the same way
  (+ "My business" for artists). Headers hide when a role sees nothing inside.

## Shipped 2026-07-05 — the "bigger swings" (Robinhood artist home + charts)
- **Chart scrubbing (the Robinhood move)**: drag a finger across the artist
  earnings chart and a hairline + dot ride the line, the readout shows that
  day's date + running total, and each day crossed gives a detent haptic tick.
  (components/MoneyChart.tsx — bespoke SVG kept, no gifted-charts needed.)
- **"Your day" card** on the artist home: next client hero'd (who, when,
  "in 45 min" countdown), rest of today in quiet rows, live minute refresh,
  empty/day-done states. RLS-scoped; client names fall back to "Client" where
  the role can't read clients. (components/TodayCard.tsx, loadToday in
  lib/personal.ts.)
- **Tappable 7-day bars**: biggest day labeled by default, tap any bar to move
  the value to it.
- **Web P&L profit chart**: diverging columns around a zero baseline (green up,
  rose down — pair validated for contrast + colorblind separation), hover
  tooltips, biggest up/down months direct-labeled. Handles 64 months of
  all-time data cleanly. (components/admin/ProfitChart.tsx.)
- NOTE: the sim build was stale (crashed on launch with
  ExpoCalendar.MissingCalendarPListValueException — binary predated the
  calendar plist keys). Fix is just `npx expo run:ios` to rebuild native.

## NEXT SESSION — the actual focus
1. **Get the full artist roster in (Scott will supply the list — he didn't
   have it handy on 2026-07-04; ask again).** Platform has 6 artists
   (elaine, jd, kalypso, moonie, sam, shorty). Square recon findings:
   - **Grey Barrix** (square team id TMS5h7Kja6CfFrFH): 16 sales in 2026, all
     small ($20-150, product/touch-up sized), last 2026-06-28. Current, missing.
   - **Stephanie Moore is the BOOKKEEPER** (Scott confirmed 2026-07-04). Her
     181 Square "sales"/$181k under TMhfO2Rp53Z_b7eg are transactions she rang
     up at the desk, NOT her own work. Leave as shop revenue; do NOT add her
     as an artist. (She should eventually get a bookkeeper login instead.)
   - Everyone else unmapped is genuinely gone (Anstey 2024, Hagerty/Chavez 2023).
   Need per artist: name, pay type (rent/split/hybrid + % / rent $), contact.
   Then set square_team_members.artist_id for their team ids -> history
   re-attributes on next sync (it re-resolves artist_id every run).
2. **Money layer follow-ups**: Scott sets the sales-tax rate + confirms what's
   taxable; enter real recurring bills (lease, utilities, software) on Expenses;
   W-2 **Gusto payroll** only if any real employees; Stripe Tap-to-Pay tax
   capture when POS work resumes.

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
