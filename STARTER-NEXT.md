# Lumenati — next-session starter

Read this first in a fresh context. Scott is NOT a coder: explain in plain
English, no jargon/file paths in chat. Never use emojis or em dashes.

## What this is
A tattoo-shop management product Lumenati owns end to end, replacing Square
(POS) and QuickBooks (books) — growing into a SaaS for every tattoo shop
(/start wizard, invite-gated). Two surfaces:
- **Web Command Center** (`/admin`, Next.js, dev on :3002) = admins.
- **Phone app** (`app-native`, Expo) = artists + admin on the go.
Public layer: Y2K site at root (custom skin) + standard template /s/<shop>.
Owner login: lumenati@icloud.com. Money: cash + Stripe, append-only ledger.

## CORE PRINCIPLE (Scott, 2026-07-08, non-negotiable)
**There is NO front desk.** The shop is run entirely by the artists; the
product gives each artist full power over their own world. Roles are ADMIN
and ARTIST only. Anything about an artist's own bookings/clients/money is
artist-doable in the app. Staff gates only protect OTHER people's worlds.
Also: **Square is historical only** — shop starts fresh in the app; NEVER
flag Square data quirks (Scott is tired of re-explaining).

## THE MISSION: execute the page-walk backlog
The 2026-07-08 page walk produced `PAGE-WALK-NOTES.md` (the detailed spec —
READ IT). Priorities, roughly in dependency order:

1. **Pay-model rebuild** (the big one; notes 2, 5, 10, 11, 15, 19, 20):
   pay types become GUSTO-PAYROLL (J.D. salary; King Kalypso + Moonie
   splits) and BOOTH-RENT (Elaine, ShorTy, Sam — drop the unused hybrid
   type). Nobody withholds anything from artists. Statements = Gusto
   payroll-prep numbers for payroll folks; renters = 100% pass-through of
   their card sales (rent billed separately, never netted). Renter sales
   stay visible in P&L as pass-through flow, never shop income. 1099 prep
   only applies to renters (accountant conversation pending). Exact %s /
   amounts: Scott enters at launch via Edit pay. Coach tax advice becomes
   pay-type aware. Cash-out-early is already deleted.
2. **Artist-driven audit** (notes 5, 7, 17): collapse frontdesk/bookkeeper
   roles into admin everywhere (web, app, RLS, api-auth). Artists mark own
   bookings completed/no-show (RLS + guard trigger like artist-cancel).
   Artists send intake forms to their own clients. Sweep "front desk"
   wording (e.g. QR card print copy).
3. **One-tap close-out** (notes 8, 12, 13): end of payment -> confirm which
   booking -> completed + aftercare drip queued + confirmation. Cash flow:
   artist logs cash at source, two-tap handoff to J.D. (optional photo of
   the stack), Stephanie only reconciles. Cash Log page becomes "cash the
   shop is holding". Expense entries get receipt photos.
4. **Booth rent engine** (notes 3, 11): auto-generate + auto-send invoices
   on the 1st, escalating nudges, rent coach in the app ("rent is $X, N
   appts booked, set aside ~$Y each"), on-time-streak reward (design open:
   Scott floated year-end discount). Plumbing already exists on /admin/rent.
5. **Rooms** (notes 4, 25): artists manage EVERYTHING from the app —
   upload/arrange profile/polaroids/portfolio (app is profile-only today),
   sticker + poster picker (currently baked-in J.D. set). Mount the main
   site's existing Winamp widget on each room wired to the artist's song
   pick. Main artists page reads accent colors from room data (hand-coded
   today). Flash wall: artists add flash from the app (site wall is empty).
6. **Up-for-grabs pool** (note 26): unassigned bookings get badge + push;
   first artist tap claims atomically; artist cancel returns to pool.
7. **Social redesign** (note 9): replace paste-a-link wall with IG
   monitoring of artist accounts (Business Discovery; artists need
   business/creator accounts) + one-tap repost to shop IG (needs Meta app +
   review). Ad generator later.
8. **UX debt** (notes 22-24): coach cards get ONE action tap each; inline
   new-client inside New Booking + New Intake forms; intake new-form flow
   redesign (client-first, explicit "text/email/tablet" send choices);
   "Sunset Square" cutover button on Integrations; compliance items get
   photo/doc attachments (renewal warnings already exist); POS web fallback
   layout is shoved off-screen left (cosmetic).
9. **BIG, separate**: mobile-browser layout for the whole Command Center
   ("match the app" feel). And the clients cleanup pass: tag artists out of
   the client roster (keep their money history).

## SHIPPED 2026-07-08 (this session, all verified in Chrome, tsc+18/18)
- Overview quick buttons: sidebar duplicates removed, only "New client"
  stays (owner + front-desk homes).
- Admin drawers (bookings/clients/intake): real frosted glass via inline
  styles — Tailwind v4 silently dropped the new classes (known gotcha).
- Reports busiest-hours chart: every hour labeled 8a-9p, faint stubs for
  quiet hours.
- App: cash-out-early button + screen DELETED; day-card/pills spacing;
  themed header defaults at Stack level (kills the blue back-button flash —
  verify on native); Expo web capped at 560px centered column on dark
  (+html.tsx added; wrapper View in the app-group layout does the capping).
- Clients: "Add walk-in" renamed "New client".
- Y2K hero: intro text centered, Get Inked/Flash Wall in a centered row
  BELOW it (legacy/hero-y2k.html).
- Kiosk flow PROVEN live end to end: booking -> unsigned form -> kiosk
  check-in -> "sign your consent form" -> real form. Test data cleaned up
  via the UI (form voided, booking cancelled — they remain as records).

## Walk status
Admin pages + app home/bookings/pos walked with Scott. NOT yet walked: app
cash, clients, my-clients, compliance, expenses, followups, goals,
healed-shots, intake, integrations, inventory, payouts, promos, qr-card,
reconcile, rent, reports, room, social, staff, waitlist; public /book,
/request, /pay, /intake, /care, /healed, /claim, /s/<shop>, /start. Scott
ended the walk satisfied; resume only if he asks.

## PARKED (do NOT build unless Scott says go)
Auto-deductions: full scope in `AUTO-DEDUCTIONS-PLAN.md` (account feed via
aggregator, artist confirms charges, feeds deductions + tax set-aside).
Note: same account-feed engine could feed SHOP expenses too (Scott liked
that). Open: who pays the fee, artist-only vs owner rollup, aggregator.

## Open / owed items
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.
- Tap to Pay go-live bundle: live Stripe keys, Apple production entitlement
  (flow demo video), real-phone done-screen check. Flow proven on sandbox.
- Owed: real 4x6 QR card print; artist push tokens (need an artist login on
  a real phone).
- App changes since the 2026-07-05 build are OTA-safe but NOT on phones
  until Scott approves a build or eas update (NEVER build without explicit
  go; before eas update set EXPO_PUBLIC_API_URL to
  https://lumenati-tattoo.vercel.app). Bug-reporter native screenshots
  still wait on one EAS build (react-native-view-shot).
- Shop-provides-supplies list: Scott will find out what the shop provides
  (Inventory stays empty until then).

## The disposable-identity test recipe (battle-tested, used again today)
scripts/two-shop-breakin.mjs automates the full second-shop matrix. Manual
recipe for app-as-artist in Chrome:
1. Auth user via Supabase admin API (service key in .env.local).
2. profiles row via PostgREST w/ service key — profiles is keyed by EMAIL
   (email/role/artist_id/full_name/shop_id; no id column). Link artist_id
   "jd" + shop 11111111-… for J.D.'s world.
3. Password-grant a session; inject JSON into localStorage
   (sb-humjddiwzzanvvqztypy-auth-token) on localhost:8081. RIGHT ORIGIN.
4. DELETE profile (by email) + auth user after. Done today, verified empty.
Sim: Scott drives it (iOS "Open in Lumenati?" dialogs need human taps;
NEVER take over his input). simctl screenshots work read-only.

## Environment gotchas (hard-won)
- Expo web works; app screens verifiable in Chrome at localhost:8081 (now a
  centered phone column). Reuse Scott's Metro if running. +html.tsx changes
  need a Metro restart to serve — runtime body-bg is set in the app layout.
- Web dev server: `npx next dev -p 3002` (plain dev binds 3000).
- Tailwind v4 silently drops utility classes new to a file — inline styles
  for must-render bits; CHECK COMPUTED STYLES (bit us again today on the
  drawers).
- App booking writes must be real instants (toISOString).
- SHOP_WIZARD_CODE local-only; schema files DRIFT from live DB — verify live.
- Kiosk device token lives in .env.local (KIOSK_DEVICE_TOKEN).

## Scott's external checklist (gates launch — docs/owner-setup-checklist.md)
- Twilio TRIAL upgrade (highest leverage: texts, phone-code logins, blasts).
- Sales-tax rate on P&L; real recurring bills on Expenses.
- GOOGLE_REVIEW_URL, GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID, email domain +
  RESEND_FROM, live Stripe keys + webhook secret, consent-copy legal review,
  FOLLOWUPS_AUTOSEND=true.
- NEW: Gusto account/plan decision (pay-model rebuild produces the numbers,
  Gusto runs payroll). Meta developer app for the Social redesign.

## How to work
- Web: `npx next dev -p 3002`; deploy = push main (Vercel). Verify money to
  the penny; verify UI by clicking it in Chrome.
- DB: SQL via the Management API (memory reference_lumenati_supabase_db).
- Commit style: what shipped + how it was verified; push when green.
