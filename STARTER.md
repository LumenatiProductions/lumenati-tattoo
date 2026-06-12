# NEXT SESSION — record the Apple TTP videos (updated 2026-06-12)

## NEW QUEST — Gusto integration (Scott asked 2026-06-12)
The shop runs payroll on Gusto (W-2 artists set withholding there; coach
copy already references it). Build, in order:
1. **SCOTT FIRST:** create a developer app at https://dev.gusto.com →
   org + application → copy Client ID + Secret → Vercel env
   (GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET). Demo/sandbox company available
   on the dev portal for testing before connecting the real company.
2. OAuth connect flow on /admin/integrations (Gusto card next to Square):
   redirect → callback route stores tokens (new gusto_connection table,
   service-role only), refresh handling.
3. Bookkeeper surfaces: payroll runs (gross/net/employer taxes) next to
   the Stripe ledger on Reconciliation + an Expenses & Books payroll line;
   per-W-2-artist wage info could feed their coach later.
4. AI/MCP layer LAST: once the API integration exists, expose payroll
   queries as tools (Gusto has no official MCP server) — for Scott/the
   bookkeeper asking Claude things like "what did payroll cost last
   quarter". Thin wrapper over our own synced tables, not direct Gusto.

# (continued) — record the Apple TTP videos

**State (2026-06-12): TAP TO PAY RUNS ON SCOTT'S IPHONE.** EAS dev builds
turned out impossible while the entitlement is dev-restricted (ad-hoc
profiles can't carry it — that's what killed the EAS dev build), so the
working path is a LOCAL Xcode dev build:

    cd ~/lumenati-tattoo/app-native
    TTP_ENTITLEMENT=1 npx expo prebuild -p ios --no-install && npx pod-install
    cd ios && xcodebuild -workspace Lumenati.xcworkspace -scheme Lumenati \
      -configuration Debug -destination 'id=00008150-000110601A87801C' \
      -allowProvisioningUpdates build
    # install: xcrun devicectl device install app --device C9093A79-15C3-5069-9E32-73C546304162 \
    #   ~/Library/Developer/Xcode/DerivedData/Lumenati-*/Build/Products/Debug-iphoneos/Lumenati.app
    # JS: npx expo start --dev-client   (phone + iMac on shop Wi-Fi)

In place already: Xcode signed in (dev cert "Apple Development: SCOTT DALTON
MCDONALD 3CGZH6KR85"), iPhone paired + Developer Mode on, TTP capability
checked on com.lumenati.app, app-native/.env.local (API URL = the Vercel
prod site, EXPO_PUBLIC_TTP=1), appleTeamId in app.json, generated ios/ is
git-ignored ON PURPOSE (it carries the dev-only entitlement — never commit).
The simulated end-to-end payment SUCCEEDS (real cards decline in test mode:
test_mode_live_card — dev-only Simulated-tap toggle is on the POS screen).

**Main quest — the three Apple review videos (Case-ID 20445539):**
1. Best footage = real success: do GO-LIVE Phase 2 (live Stripe keys) first,
   tap a real card for a few bucks, refund after. (Simulated works today if
   Apple accepts it.) Docs: https://apple.box.com/v/ttpoirequirements
2. Record on-phone: "New User Flow" (first launch + Apple TTP terms),
   "Existing User Flow", "Checkout Flow".
3. Checklist + File Uploader links are in the TTPOI email; REPLY with the
   Case-ID. When Apple lifts the restriction: entitlement unconditional,
   drop the EXPO_PUBLIC_TTP gate (lib/terminal.ts + eas.json), rebuild
   production → crew gets TTP via TestFlight.

**Shipped this session (2026-06-11→12):**
- POS business rules (server-enforced in /api/terminal/payment-intent):
  artists ring up ONLY themselves (their split/rent terms) or Shop; explicit
  `shop: true` = no-split shop sale (merch) — before, an artist picking Shop
  silently routed money to themselves. Desk roles pick anyone. "Take
  payment" launcher tile for ALL roles (Scott: everyone sells merch).
- POS register screen: giant lights-up display, reader dot, custom keypad.
- Y2K payment blast v2: pixel fonts (Press Start 2P/VT323), CRT scanlines +
  sweep + flicker, shockwave rings, slam+glitch, count-up, 2 confetti waves,
  5.6s, tap-to-skip, transparent Modal (nothing covers it).
- App-wide haptics (expo-haptics, NATIVE — TestFlight needs build 15):
  lib/haptics.ts semantic kit wired into Button/ListRow/Chips/Launcher/POS.
- Fixed prod EXPO_PUBLIC_API_URL on EAS (was localhost:3210 — build 14's
  server calls were broken; fixed for the NEXT build).

**Side quests (any order):**
- Queue build 15 (haptics + wave 2 + POS rules + fixed API URL):
  `npx eas-cli build -p ios --profile production --auto-submit`
  (mind build credits — 93% used as of 2026-06-11).
- Android: Scott's tester Gmail + opt-in link
  https://play.google.com/apps/internaltest/4701288504633492438
- Push notifications: `npx eas-cli credentials` → APNs key + FCM (interactive).
- GO-LIVE Phase 2/3: live Stripe keys + Connect onboarding.

## App parity wave 2 (shipped 2026-06-11)
Five screens, same component kit, RLS-direct where possible:
- **Payouts**: per-artist statements with the web's settled_through math
  (sales mirror + pending rent_invoices), Mark settled → /api/settlements
  (receipt email still sends), artists see only their own statement.
- **Intake**: needs-attention queue, start-a-form → share sheet with the
  signing link (hex sign tokens via expo-crypto), confirm ID, void.
- **Reconciliation**: /api/reconcile (headline diff hero, Stripe payouts,
  drawer closes).
- **Staff**: profiles allowlist add/remove (self-lockout guard), owner only.
- **Integrations**: Square sync status + Sync now + member→artist mapping.
- Server: `resolveStaff()` in lib/api-auth.ts — cookie OR Bearer for
  /api/settlements, /api/reconcile, /api/square/sync POST (Bearer path uses
  the service-role client AFTER the role check; artist scoping explicit).

# STARTER — read this first (resume point)

One doc to resume from in a fresh chat without re-reading history. If you (the
assistant) are starting cold: read this, then `GO-LIVE.md` for the checklist.
Keep this file updated as the single source of truth.

## Where we are (2026-06-09)

The whole platform is **BUILT and deployed**. Web admin lives at
`https://lumenati-tattoo.vercel.app` (Next 15, on Vercel, team `cinebody`). The
phone app is in `app-native/` (Expo SDK 52, universal: iOS/Android/web). All
Supabase tables + RLS are **already applied** to the live DB.

Most remaining work is **turning features on with keys/accounts — not coding.**

## Done + live
- Command center: clients, compliance, inventory, bookings, intake, follow-ups, reports
- Role-routed homes + owner cockpit + daily automation (no-show forfeit is opt-in)
- Owned books (shop expenses + Stripe ledger + accountant CSV)
- The app (6a–6e): money/goals/taxes, in-person POS, instant cashout, snap
  receipt + snap-to-count, bookings/clients/inventory/compliance with create+edit+delete
- **Payments: LIVE in Stripe TEST mode** — keys + webhook set on Vercel, verified end to end.
- **AI snaps LIVE** — `ANTHROPIC_API_KEY` set on Vercel, verified (`/api/vision` 401 with key).
- **Email/morning brief LIVE** — `RESEND_API_KEY` + `DIGEST_RECIPIENTS` set; Scott received the brief.
- **Stripe Connect ENABLED** (sandbox) — app creates Express accounts in code; live Connect still gated behind Stripe go-live.
- **Kiosk token DONE** — `KIOSK_DEVICE_TOKEN` set on Vercel + verified (`/api/kiosk` 401→200).

## Product pass 2 (done 2026-06-10, ALL schemas applied + verified)
Eight more features, closing every loop from pass 1:
- **Accept auto-sends the deposit link** (text-first, email fallback, URL
  surfaced to the desk either way).
- **Healed-photo uploads**: follow-up links to /healed/<followup-id>; uploads
  queue on Social for approval; approve appends to the artist's room portfolio
  on the public site. healed-photos bucket + healed_photos table LIVE.
- **Reply C confirms**: /api/sms/inbound (Twilio signature-validated) stamps
  bookings.confirmed_at; Confirmed ✓ badge on Bookings + week view. Point the
  Twilio Messaging Service inbound hook at /api/sms/inbound when keys land.
- **In-house rent invoicing**: rent_invoices LIVE; monthly generation in daily
  ops + Generate button; pay links (payments.kind='rent', never split);
  webhook marks paid; Email-it per invoice. Square panels stay until cutover.
- **Week calendar** on Bookings (Agenda/Week toggle, artist-colored blocks).
- **Event push**: new request -> desk, payment settled -> owner+artist,
  day-ahead per artist (all no-op until EAS device tokens exist).
- **Insights on Reports**: rebooking %, no-show by artist, busiest hours, top
  clients.
- **Error boundaries + ALERT_WEBHOOK_URL reporter + vitest suite (18 tests)**.
  The suite immediately caught and fixed a real age-gate bug (UTC-parsed DOBs
  passed minors the evening before their 18th in Denver).

## Product pass (done 2026-06-09, ALL schemas applied to the live DB)
Twelve features shipped end to end in one session; every schema is ALREADY
APPLIED via the SQL editor (verified):
- **SMS (Twilio, gated)**: lib/sms.ts; consent links, follow-ups, reminders all
  text when TWILIO_ACCOUNT_SID/AUTH_TOKEN + (MESSAGING_SERVICE_SID or
  FROM_NUMBER) land on Vercel. Until then everything falls back to email.
- **Reminders**: reminder_48h/reminder_24h followup kinds, enqueued nightly off
  scheduled bookings, cancel-aware, SMS-first. **Healed photo** ask at 14d.
- **Tips on /pay**: 15/20/25/custom; payments.tip_cents; fee on service only,
  tip rides to the artist. Deposits stay tip-free.
- **Booking requests**: public /request form -> Requests inbox on Bookings;
  accept finds-or-creates the client + books with source=web_request. The Y2K
  site is untouched — link /request from it whenever Scott wants.
- **Drawer sessions**: open float / count & close, over/short strip on Cash.
- **Settlement receipts**: Mark settled emails the artist their statement.
- **Guardian co-sign**: OFF until MINORS_GUARDIAN_CONSENT=true (counsel first).
- **Reconciliation page LIVE** (sidebar stub gone): Stripe vs our records diff.
- **Inventory restock from expenses**: one supplies entry books cost + stock.
- **Client merge** (owner): drawer "merge into…" re-points all history.
- **Real consent/medical/aftercare copy**: in lib/intake/forms.ts; signer shows
  "pending final legal review" until LEGAL_COPY_REVIEWED=true. SEND TO COUNSEL.
Scott's two outstanding inputs: Twilio account/keys + attorney review of the
consent wording.

## Quality pass (done 2026-06-09, full command-center sweep)
Four-agent audit + fixes across every admin page, API, kiosk, intake, and pay
flow. Highlights:
- **Cash Log is real** (was 100% mock): `cash_entries` + `/api/cash` +
  `CashProvider`; owner/bookkeeper homes read live unreconciled cash.
- **Payouts "Mark settled" is real** (was a dead button): `settlements` table;
  statements compute from sales after each artist's `settled_through`; Square
  rent invoices matched by payer name now feed `rentOwed`.
- **Two new schemas need a paste** in the Supabase SQL editor (tracked in
  GO-LIVE.md): `cash-schema.sql`, `settlements-schema.sql`. Both pages degrade
  gracefully until then.
- Hardening: constant-time kiosk token compare, kiosk acts only on today's
  bookings, consent double-sign guard (409 → signed screen client-side),
  bearer-auth requires a profiles row (off-boarded staff lose app access),
  $20k amount caps, deposit-status enum validation.
- Polish: clients drawer shows real appointment history, room editor has a
  save indicator, owner-only pages gate cleanly, staff/artist removals confirm
  + surface errors, optimistic mutations self-correct on failure.

## Branding & design (done 2026-06-09, deployed)
Two identities, on purpose:
- **Console / payments / intake / app = clean Lumenati parent brand:** the
  all-seeing-eye + wordmark logo (`public/brand/lumenati-on-light.svg` = dark marks,
  `lumenati-on-dark.svg` = white marks; shared `components/brand/LumenatiLogo.tsx`),
  **Helvetica Neue**, pink (`#ff1493`) accent kept. App uses `react-native-svg`
  (`app-native/components/LumenatiLogo.tsx`, fills baked inline) + Helvetica Neue
  set globally in `app-native/app/_layout.tsx`.
- **Kiosk = FULL Y2K** (front-of-house, matches the public site): neon/CRT, Press
  Start 2P / VT323 / Share Tech Mono, scanlines, marquee, gel buttons, glowing eye.
  Has a **customer welcome/attract screen** (device-code screen is staff-only).
  `appleWebApp` meta added → **Add-to-Home-Screen launches fullscreen** (no URL bar);
  plain Safari still shows the URL bar.
- **Public Y2K site: untouched** (Scott likes it).

## Next — go-live, easiest first (track in GO-LIVE.md)
1. **Real money (Stripe live)** — Scott finishes Stripe business verification, then
   swap test keys for `sk_live_`/`pk_live_` + a live webhook. (Phase 2)
2. **Connect artist onboarding** — BLOCKED on Scott's full artist list + per-artist
   splits. Then admin → Payouts → send onboarding links. (Phase 3)
3. **App on phones** — `eas init` (writes projectId → push), dev build, Apple/Google
   Tap to Pay enrollment. (Phase 7)
4. **Cutover** — retire QuickBooks then Square. Runbook: `CUTOVER.md`. (Phase 8)

Smaller follow-ups:
- **Console local review needs Supabase redirect allowlist:** the admin magic link
  redirects to `location.origin/auth/callback`; `http://localhost:3210` isn't in
  Supabase → Auth → URL Configuration → Redirect URLs, so local sign-in bounces to
  prod. Add it to review the branded console on localhost.

## How things work here (so you don't re-discover)
- **Apply a DB schema:** paste the SQL into the Supabase SQL editor and Run (the
  project is NOT linked to the Supabase CLI). Project ref `humjddiwzzanvvqztypy`.
- **Set a Vercel env var:** `vercel env add NAME production` (CLI is authed). To
  redeploy after env changes, push an empty commit — `vercel redeploy <alias>`
  hits a team-scope error.
- **Secrets:** the assistant doesn't enter real financial credentials/API keys —
  Scott adds those (Stripe test keys were the sandbox exception). Public keys
  (`pk_…`, kiosk token) are fine for the assistant to set.
- **App talks to Supabase directly under RLS** for reads/writes; only Stripe,
  vision, and Tap to Pay go through the Next API (Bearer auth via `lib/api-auth.ts`).
- **Build checks:** `npm run build` (web), `cd app-native && npx tsc --noEmit` (app).
- Apply-then-verify schema edits return "Success. No rows returned" in the SQL editor.
- **Design harness (local, on the iMac):** `PORT=3210 npm run dev` (web), and
  `cd app-native && npx expo start --ios` for the app on the iPhone sim. For the
  kiosk-as-iPad: boot an iPad sim, `xcrun simctl openurl <udid> http://localhost:3210/kiosk`,
  rotate to landscape (Cmd+←). **Local kiosk device code is `bedroom`** (in `.env.local`,
  gitignored; prod uses the long Vercel token). Sim text entry is flaky (long-press →
  accent popup) — prefer Connect Hardware Keyboard or short input.
- Driving Chrome: connect the **"Imac"** browser (`select_browser`), not "Studio".

## Roadmap (future — Scott-stated, not started)

- **Merch sales** (2026-06-10): merch inventory + sales. Scott: maybe no
  barcodes — "take a photo of the tag or something easy" (vision recognition;
  the snap-to-count vision pipeline already does exactly this shape). And
  artists get a CUT on merch they sell — incentivize pushing it (rides the
  existing per-artist split machinery + the POS For: picker). Extend
  `inventory_items` with a merch kind (price/stock), merch line on the POS,
  merch slice on Reports.
- **App parity backlog** (full-parity directive): Payouts/Artists & Pay,
  Intake, Reconciliation, Staff, Integrations.
- **Android Tap to Pay**: Google enrollment when an Android artist needs it.
- **Productize (future-future, 2026-06-10)**: sell the command center to other
  tattoo shops. Early shape: clone-per-shop template (own Supabase+Vercel,
  config for brand/roster/splits); the per-artist money rails (splits,
  cash-out, tax set-aside, booth rent) are the wedge no incumbent has. Y2K
  front-of-house becomes a white-label personality layer; back office is
  already brand-neutral.

## Resume prompt (paste into a new chat)
> Read `STARTER.md`, then continue the Lumenati go-live. Do everything you can
> without me and tell me which keys/accounts you need. Start with the next
> unchecked item.
