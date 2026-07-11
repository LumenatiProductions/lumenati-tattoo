# Lumenati — next-session starter: DEEP PASS (bugs/db/security/App Store), then TEMPLATES

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

## Where things stand (2026-07-11 end of day, all committed + pushed)
- "Room" is "Page" everywhere users see it. DB stays room_content.
- POCKET ARCADE + CABINET SELECTOR shipped: every page's Games window
  boots a LUMENATI ARCADE select screen (public/arcade-selector.js);
  games load one at a time as /arcade-embed/<id> cartridge iframes
  (route handler, NOT a (site) page — those inherit Winamp/Clippy).
  Fullscreen cabinet on touch (public/arcade-cabinet.js) with woodgrain
  panels + black bezel, FIRE buttons for Sterile!/Flash Breaker, skate
  swipe tricks. Per-artist game picking fully retired (renderer ignores
  room_content.game_id; column still exists — candidate for the schema
  sweep below). The arcade is Lumenati-showroom-only by design.
  Verified in Chrome both widths; smoke 10/10; vitest 41/41. Scott has
  NOT yet thumbed it on real glass.
- docs/product-shape.md = the pricing/product design (two SKUs,
  graduated 4.9/2.9 fee + transparency receipt, Artist Passport with
  edges resolved, themes, build order). Two open Scott's-call items
  inside (proration timing on the $99-to-$79 conversion; move notice
  vs veto). Nothing from it is built yet.

## Priority 1 — the deep pass: bugs, DB/schema, security, App Store
One hardening sweep before product work. Four lanes, work them in order:

1. **Bug pass.** Walk every surface like a hostile user: web admin pages,
   app screens (Metro web + the disposable-identity ritual if the
   classifier allows), public pages, arcade on both widths, POS flows
   with Stripe test keys. Check bug_reports for anything new. Fix as you
   go, smallest change that works.
2. **DB + schema audit.** Live schema vs what the code believes:
   - Known drift to resolve on purpose: profiles.artist_id FK points at
     room_content (not artists) — decide and document, or fix.
   - Retired columns: room_content.game_id (cabinet made it dead);
     video_title migration leftover from the roadmap.
   - Missing indexes on hot paths (bookings by artist+date, payments),
     orphan rows, FK gaps, the arcade-demo-* rooms sweep (Scott said
     he's done playing — confirm before deleting).
   - PostgREST 1000-row cap: any aggregation route not paginating.
3. **Security audit.** RLS on EVERY table (anon key must see nothing it
   shouldn't — test allow AND deny like the test-identity ritual),
   storage buckets (compliance-docs must stay private; signed URLs
   only), API routes that trust the client, the HMAC webhook lanes,
   service-key usage server-side only, secrets: .env files out of git,
   rotate anything ever committed (memory: project_launch_secrets),
   Supabase PAT expires 2026-07-31.
4. **App Store readiness.** Everything between TestFlight and a real
   listing. Known list to verify and expand:
   - Apple requires in-app ACCOUNT DELETION for apps with accounts.
   - Privacy policy URL + App Privacy questionnaire (what we collect).
   - Permission strings (camera, photo library, location if any).
   - Payments: tattoo money is physical services -> Stripe is allowed,
     NO Apple IAP needed; be ready to explain that in review notes.
   - Scott's known item: RECORD THE PURCHASE ACTIONS demo — the
     screen recording of the payment flow Apple wants for the Tap to
     Pay production entitlement request. Set up everything so Scott can
     record it on his phone in one take; walk him through it.
   - Demo/review account for Apple (sandboxed, not prod owner login).
   - Tap to Pay go-live bundle: live Stripe keys, production
     entitlement, real-phone done-screen check (sandbox proven).
   - Build 21 to TestFlight ONLY on Scott's explicit go.
   Produce docs/app-store-checklist.md: what's done, what's blocked on
   Scott (Apple portal things), what's blocked on Apple.

## Priority 2 — page templates (the product, buildable by an artist today)
After the deep pass. Goal: an artist signing up cold could build a
beautiful page right now, no Lumenati hand-holding.

- room_content is already theme-agnostic data; templates are renderers
  over the same row. Start with 2-3: minimal portfolio, dark ink,
  classic flash-sheet. The Y2K bedroom + arcade stay Lumenati-only
  showroom; every template page carries the "powered by Lumenati"
  footer (that footer is the ad).
- **THE KEY DESIGN DECISION (Scott, 2026-07-11): the theme belongs to
  the SHOP, not the artist page.** A shop picks its style; every
  artist page at that shop renders in it. When an artist ports to a new
  shop (Artist Passport), their page data travels untouched and simply
  re-renders in the new shop's theme — same photos, bio, flash, new
  clothes. Solo artists (no shop) pick their own theme. This falls out
  of the architecture we already have (content = data, theme =
  renderer); build it so the port case is literally zero migration.
- Suggested shape: shops.theme_id (+ artist override only for solos),
  one render entry point that picks the renderer, shared data loader.
  Onboarding: the app's My Page editor already builds all the content —
  make sure a brand-new artist's empty page looks intentional in every
  template (empty states matter more than full ones).
- Then continue product-shape build order: graduated fee engine +
  transparency receipt -> SKU billing -> Passport flows.

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers are already running (:3002 web, :8081 Metro). NEVER
  kill Metro. Shell cwd resets between calls — cd the repo first.
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`
  (SUPABASE_ACCESS_TOKEN in ~/.zshrc). Even additive columns can get
  classifier-blocked — ask Scott for shift+tab / manual mode. Last
  session the classifier also blocked prod test-identity INSERTS and
  select=* reads on profiles/artists (PII); information_schema and
  single-column reads passed fine.
- COLUMN-GRANT GOTCHA IS REAL: tables with per-column grants (shops!)
  need explicit `grant select (col), update (col) ... to authenticated`
  for any NEW column, or app writes silently 42501. supabase-js default
  writes use return=minimal, which masks it — test with representation.
- UI verification on Metro web: disposable test identity (memory:
  reference_lumenati_test_identity), classifier permitting; otherwise
  grep the served Metro bundle for the strings.
- Metro web CANNOT click buttons that call the Next API — prove API
  paths with curl + Bearer. Supabase-direct actions click fine.
- readLegacyBlock rewrites CDN URLs to /legacy-assets and adds
  loading=lazy — template assertions must expect the rewritten form.
- Verify UI in Chrome MCP (never computer-use). No real sends
  (RENT_AUTOSEND / FOLLOWUPS_AUTOSEND stay off).
- Chrome MCP tab occlusion freezes requestAnimationFrame — game canvases
  screenshot black/frozen. DOM checks still work; not a bug.
- Arcade changes: `node scripts/arcade-smoke.mjs` + vitest; verify in
  Chrome with `?touch=1` at phone width (forces cabinet on desktop).

## Standing leftovers
- arcade-demo-* rooms sweep (fold into the schema audit above).
- Build 21 to TestFlight on Scott's explicit go (app-native/.env already
  points at prod). The arcade lives on WEB pages, phones already have
  it; only the app's renamed labels wait on build 21.
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.

## Still Scott's (remind if asked, don't build)
- Twilio upgrade, then RENT_AUTOSEND=true (and FOLLOWUPS_AUTOSEND).
- Artist logins on the Team page (gates rent nudges + pool pushes).
- Sales-tax rate, recurring bills, live Stripe keys, GOOGLE_* keys, email
  domain (docs/owner-setup-checklist.md).
- Meta developer app for the Social redesign; Gusto account decision.
- Sunset Square cutover button: build only when Scott says go.
- The two Scott's-call items in docs/product-shape.md.
