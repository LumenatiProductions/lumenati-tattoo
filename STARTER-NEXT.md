# Lumenati — next-session starter: CABINET SELECTOR, PRODUCT SHAPE BUILD

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

## Where things stand (2026-07-11 evening, all committed + pushed)
- "Room" is now "Page" everywhere users see it (app launcher/screen/toasts,
  web admin sidebar/editor/artists/healed queue). DB stays room_content;
  the Y2K bedroom fiction keeps its walls/snapshots wording.
- POCKET ARCADE shipped: `public/arcade-cabinet.js` (loaded by the room
  template AND /arcade previews) makes touch devices go fullscreen-cabinet
  on tap — scroll locked, canvas scaled, close restores everything, sits
  above Winamp/Clippy (z 1000000 vs their 999999). Sterile! + Flash
  Breaker get two drawn FIRE buttons (hold-repeats real Space key events).
  Skate: tap = ollie, swipe = jump+trick in one gesture, swipe-down held =
  manual. shooter/bricks use targetTouches so the FIRE thumb can't hijack
  the drag finger. Every game shows touch hints when touch exists.
  `?touch=1` forces cabinet mode on desktop for demos. Verified: smoke
  harness 10/10, vitest 42/42, Chrome at phone width (room + previews).
  NOT yet verified on Scott's real iPhone — swipe-trick feel especially.
- Product shape design doc written: `docs/product-shape.md` (two SKUs,
  graduated 4.9/2.9 fee with transparency receipt, Artist Passport with
  the three edges resolved, page themes, build order). Two "Scott's call"
  items inside it (proration on the $99-to-$79 conversion; move notice
  vs veto). DESIGN ONLY — nothing built.

## Priority 1 — cabinet selector (pending Scott's go, recommended YES)
Scott asked (2026-07-11): drop per-artist game picking; every page gets
the full cabinet with all 9 games behind an old-school game selector
screen. Recommended design (see session notes):
- Selector = the cabinet's attract/boot screen: INSERT COIN marquee, 9
  titles, joystick/tap to choose. Fits the fiction and the new pocket
  cabinet on phones.
- One game runs at a time via cartridge iframes: the selector loads a
  stripped /arcade/<id> embed (`?embed=1`, no switcher/site chrome) into
  the cabinet window. Avoids 9 IIFEs double-binding key listeners on one
  page. Flash Match still needs the artist's flash wall passed through.
- If it ships: remove the game picker from app My Page + web editor
  (also removes the "Try the games first" button), artist accent still
  themes the cabinet. Leaderboards stay per-machine localStorage.

## Priority 2 — product shape build order (after Scott reviews the doc)
Themes -> graduated fee engine + transparency receipt -> SKU billing ->
Passport. Each shippable alone; docs/product-shape.md has the details.

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers are already running (:3002 web, :8081 Metro). NEVER
  kill Metro. Shell cwd resets between calls — cd the repo first.
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`
  (SUPABASE_ACCESS_TOKEN in ~/.zshrc). Even additive columns can get
  classifier-blocked — ask Scott for shift+tab / manual mode. This session
  the classifier also blocked prod test-identity INSERTS and select=* on
  profiles/artists (PII); information_schema + single-column reads passed.
- COLUMN-GRANT GOTCHA IS REAL: tables with per-column grants (shops!)
  need explicit `grant select (col), update (col) ... to authenticated`
  for any NEW column, or app writes silently 42501. supabase-js default
  writes use return=minimal, which masks it — test with representation.
- UI verification on Metro web: disposable test identity (see memory
  reference_lumenati_test_identity) — but see classifier note above; this
  session verified app copy via the served Metro bundle grep instead.
- Metro web CANNOT click buttons that call the Next API — prove API paths
  with curl + Bearer. Supabase-direct actions click fine in Chrome.
- readLegacyBlock rewrites CDN URLs to /legacy-assets and adds
  loading=lazy — template assertions must expect the rewritten form.
- Verify UI in Chrome MCP (never computer-use). No real sends
  (RENT_AUTOSEND / FOLLOWUPS_AUTOSEND stay off).
- Chrome MCP tab occlusion freezes requestAnimationFrame — game canvases
  screenshot black. DOM checks still work; don't chase it as a bug.
- Arcade changes: run `node scripts/arcade-smoke.mjs` + vitest; verify in
  Chrome with `?touch=1` at phone width.

## Standing leftovers
- Sweep the 8 demo rooms when Scott says he's done playing
  (arcade-demo-* artists + room_content rows, service key).
- Build 21 to TestFlight on Scott's explicit go (app-native/.env already
  points at the prod URL). Build 20 pre-dates Pages rename + pocket
  arcade; note the arcade lives on WEB pages so phones get it without a
  new build — only the app's renamed labels wait on build 21.
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
