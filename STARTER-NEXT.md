# Lumenati — next-session starter: PAGES, POCKET ARCADE, PRODUCT SHAPE

Read this first in a fresh context. Scott is NOT a coder: explain in plain
English, no jargon/file paths in chat. Never use emojis or em dashes. Dive
straight into Priority 1 — no questions, no menus.

## What this is
A tattoo-shop management product Lumenati owns end to end. Two surfaces:
- **Web Command Center** (`/admin`, Next.js, dev on :3002) = admins.
- **Phone app** (`app-native`, Expo, Metro :8081) = artists + admin on the go.
Public layer: Y2K site at root. Owner login: lumenati@icloud.com.
Core principle: NO front desk — artists run their own world from the app.
Square is historical only; never flag its data quirks.

## Where things stand (2026-07-11, all committed + pushed)
- ARCADE complete: 9 games with levels/music/announcer voices/leaderboards,
  playable previews at `/arcade/<id>` with a switcher row, app "Try the
  games first" button. JD's room is now REAL room data (four wall posters,
  Ink or Die, his skate edit pulled from Vimeo into room-photos) — built
  through the same pipeline as every artist.
- Bug sweep: all 11 reports fixed and marked `fixed` in bug_reports
  (instant photo preview + Uploading states, accent ring around the whole
  tile, bug reporter above the keyboard, inline calendar date picker,
  client search over the whole book, artist-scoped booking form even in
  preview, calendar-sync connected state with provider logos, pay rent by
  card from the app via `/api/rent/pay-link`, booking calendar on the
  artist home, button label padding, compliance self-scan).
- Compliance: artists add + camera-scan their own license/BBP (private
  `compliance-docs` bucket, artist RLS lane applied to prod; the web admin
  opens path scans via signed URLs).
- Shop home (app) now matches the artist page: range toggle, Shop earned
  hero, revenue race chart vs a shop weekly goal (shops.goal_weekly_cents,
  set/edited with the drag dial on the page — $5,000/wk starter saved,
  Scott can drag it), Chairs leaderboard (tap = view as that artist),
  7-day bars, and a SHOP COACH (deterministic reads: rebook rate, rent
  outstanding, one-chair concentration, quiet days, deposit discipline,
  follow-ups due, best-week chase).
- The same shop coach lives on the desktop owner overview
  (`components/admin/home/ShopCoach.tsx` + `lib/admin/shop-coach.ts`).
  Keep it in lockstep with `app-native/lib/shop-coach.ts` — one read,
  two renderers, never disagreeing.
- Odd launcher/stat tiles no longer stretch full width (maxWidth cap;
  only the hero money tile spans the row, on purpose).
- TestFlight: build 20 is live but PRE-DATES all of 2026-07-11. Build 21
  NOT sent — Scott said not yet. Never run eas build/update without his
  explicit go.

## Priority 1 — "Room" becomes "Page"
Product story: every artist gets their own PAGE. UI copy sweep only —
the app's My Room screen + launcher label, web admin room editor
headings, toasts like "your room is live". DB stays room_content
(Cinebody "Project not Shoot" pattern). The Y2K theme may keep "room"
flavor inside the bedroom fiction itself.

## Priority 2 — pocket arcade (games on phones)
The games were designed for a keyboard; on phones they letterbox and
have no buttons. Agreed direction (2026-07-11):
1. Full-screen cabinet mode on touch devices: tapping the game window
   takes over the viewport, page scroll locked, small close button.
2. Per-game touch decks designed for thumbs: invisible left/right steer
   zones, tap = jump/fire, swipes = skate tricks, drag for Steady Hand
   (already touch-fine). Games that need a fire button (Sterile!, Flash
   Breaker's laser) get one or two big drawn arcade-cabinet buttons in
   the bottom corners.
3. The intro instruction strip shows TOUCH hints when touch is detected,
   keyboard hints otherwise.
Applies to room pages AND `/arcade/<id>` previews (same markup). Verify
with the headless harness (scripts/arcade-smoke.mjs) plus phone-width
Chrome.

## Priority 3 — product shape (design first, then build)
Scott's direction from the pricing conversation (memory:
project_lumenati_business_model):
- Two SKUs: Artist $99/mo solo; Shop $199 base + $79/seat. A solo's $99
  converts to a $79 seat when their shop joins (a discount, not a capture).
- Payments GRADUATED, not flat: 4.9% on the first $200 of a payment,
  2.9% above it. Deposits/flash pay full rate; big sessions read fair.
  Instant payout 1.5% opt-in. Consider per-payment Stripe/Lumenati fee
  transparency as an artist-first flex.
- Artist Passport: the artist account is global; shops are stamps in it.
  Moving to another Lumenati shop = invite + one accept: page moves,
  client book + money history stay theirs, license scans carry over. The
  old shop keeps its ledger. Edges to design: future bookings
  transfer-or-cancel, held deposits, final rent settle-up.
- Page themes: room data is theme-agnostic; build 2-3 professional
  templates (minimal portfolio, dark ink, classic flash-sheet) rendering
  the same room_content. The Y2K arcade theme stays Lumenati-only
  showroom — never a template ("powered by Lumenati" footer is the ad).

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers are already running (:3002 web, :8081 Metro). NEVER
  kill Metro. Shell cwd resets between calls — cd the repo first.
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`
  (SUPABASE_ACCESS_TOKEN in ~/.zshrc). Even additive columns can get
  classifier-blocked — ask Scott for shift+tab / manual mode.
- COLUMN-GRANT GOTCHA IS REAL: tables with per-column grants (shops!)
  need explicit `grant select (col), update (col) ... to authenticated`
  for any NEW column, or app writes silently 42501. supabase-js default
  writes use return=minimal, which masks it — test with representation.
- UI verification on Metro web: disposable test identity (auth user via
  service key, profile via Mgmt API SQL, password-grant, inject
  localStorage key sb-humjddiwzzanvvqztypy-auth-token on :8081). DELETE
  EVERYTHING after — rows, auth user, localStorage, token files. See
  memory reference_lumenati_test_identity.
- Metro web CANNOT click buttons that call the Next API — prove API paths
  with curl + Bearer. Supabase-direct actions click fine in Chrome.
- readLegacyBlock rewrites CDN URLs to /legacy-assets and adds
  loading=lazy — template assertions must expect the rewritten form.
- Verify UI in Chrome MCP (never computer-use). No real sends
  (RENT_AUTOSEND / FOLLOWUPS_AUTOSEND stay off).

## Standing leftovers
- Sweep the 8 demo rooms when Scott says he's done playing
  (arcade-demo-* artists + room_content rows, service key).
- Build 21 to TestFlight on Scott's explicit go (app-native/.env already
  points at the prod URL).
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.
- Tap to Pay go-live bundle: live Stripe keys, Apple production
  entitlement, real-phone done-screen check (sandbox proven).

## Still Scott's (remind if asked, don't build)
- Twilio upgrade, then RENT_AUTOSEND=true (and FOLLOWUPS_AUTOSEND).
- Artist logins on the Team page (gates rent nudges + pool pushes).
- Sales-tax rate, recurring bills, live Stripe keys, GOOGLE_* keys, email
  domain (docs/owner-setup-checklist.md).
- Meta developer app for the Social redesign; Gusto account decision.
- Sunset Square cutover button: build only when Scott says go.
