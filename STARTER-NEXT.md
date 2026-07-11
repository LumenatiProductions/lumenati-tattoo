# Lumenati — next-session starter: PAGE TEMPLATES (the deep pass is done)

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

## Where things stand (2026-07-11, deep pass done, committed)
The four-lane hardening sweep ran end to end:
- **Bugs**: bug_reports inbox empty (all 11 recent = fixed). Reports/insights
  admin pages verified live in Chrome; JD's public page + arcade verified;
  vitest 40/40 + arcade smoke green.
- **DB**: FK drift found (profiles AND sales AND square_team_members pointed
  artist_id at room_content, not artists; zero orphans, safe to repoint) —
  fix written as supabase/2026-07-11-schema-sweep.sql, CLASSIFIER-BLOCKED,
  needs Scott shift+tab. video_title migration is LIVE already (non-item).
  game_id retired from all code; drop is supabase/2026-07-11-drop-game-id.sql,
  run ONLY after build 21 ships (old builds probe it for the video editor).
  1000-row cap fixed on /api/insights + /api/reports bookings pulls.
- **Security**: anon break-in 32/32 tables clean; two-shop wall holds; buckets
  correct (compliance-docs/proof/bug-reports private). Hardened: timing-safe
  secret compares on 6 cron lanes + shop wizard (+ per-instance brute-force
  brake), digest now fails closed, report-error same-origin + throttled.
- **App Store**: account deletion shipped (Home footer -> DELETE /api/account,
  sole-admin guardrail), /privacy page live + linked from app sign-in, mic
  permission stripped, Bluetooth/LocalNetwork strings added. Everything else
  is docs/app-store-checklist.md — the source of truth for the listing.

## Priority 1 — page templates (the product, buildable by an artist today)
Goal: an artist signing up cold could build a beautiful page right now.

- room_content is already theme-agnostic data; templates are renderers
  over the same row. Start with 2-3: minimal portfolio, dark ink,
  classic flash-sheet. The Y2K bedroom + arcade stay Lumenati-only
  showroom; every template page carries the "powered by Lumenati"
  footer (that footer is the ad).
- **THE KEY DESIGN DECISION (Scott, 2026-07-11): the theme belongs to
  the SHOP, not the artist page.** A shop picks its style; every
  artist page at that shop renders in it. When an artist ports to a new
  shop (Artist Passport), their page data travels untouched and simply
  re-renders in the new shop's theme. Solo artists (no shop) pick their
  own theme. Build it so the port case is literally zero migration.
- Suggested shape: shops.theme_id (+ artist override only for solos),
  one render entry point that picks the renderer, shared data loader.
  Onboarding: the app's My Page editor already builds all the content —
  make sure a brand-new artist's empty page looks intentional in every
  template (empty states matter more than full ones).
- Then continue product-shape build order (docs/product-shape.md):
  graduated fee engine + transparency receipt -> SKU billing -> Passport.
  Two open Scott's-call items still live in that doc.

## Waiting on Scott (remind, don't nag)
- Run the blocked DDL (classifier): `node scripts/apply-sql.mjs
  supabase/2026-07-11-schema-sweep.sql` in shift+tab manual mode.
- Confirm the arcade-demo rooms sweep, then apply
  supabase/2026-07-11-sweep-arcade-demo-rooms.sql (8 rooms + 3 demo flash).
- App Store portal items — all spelled out in docs/app-store-checklist.md:
  App Privacy questionnaire answers, privacy URL, reviewer demo account
  (script queued: scripts/provision-review-account.mjs + one Supabase test-OTP
  toggle), Tap to Pay one-take recording script, build 21 go.
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.
- Thumb the arcade cabinet on real glass (still unverified on touch).

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers are already running (:3002 web, :8081 Metro). NEVER
  kill Metro. Shell cwd resets between calls — cd the repo first.
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`
  (SUPABASE_ACCESS_TOKEN in ~/.zshrc). Schema-altering statements get
  classifier-blocked — queue them and ask Scott for shift+tab / manual mode.
  Read-only introspection via the Management API query endpoint passes.
- COLUMN-GRANT GOTCHA IS REAL: tables with per-column grants (shops!)
  need explicit `grant select (col), update (col) ... to authenticated`
  for any NEW column, or app writes silently 42501. supabase-js default
  writes use return=minimal, which masks it — test with representation.
- UI verification on Metro web: disposable test identity (memory:
  reference_lumenati_test_identity), classifier permitting; otherwise
  grep the served Metro bundle: curl the per-route bundle, e.g.
  `curl -s "http://localhost:8081/app/(app)/home.bundle?platform=web&dev=true" | grep -c <string>`.
- Metro web CANNOT click buttons that call the Next API — prove API
  paths with curl + Bearer. Supabase-direct actions click fine.
- readLegacyBlock rewrites CDN URLs to /legacy-assets and adds
  loading=lazy — template assertions must expect the rewritten form.
- Verify UI in Chrome MCP (never computer-use). No real sends
  (RENT_AUTOSEND / FOLLOWUPS_AUTOSEND stay off).
- Chrome MCP tab occlusion freezes requestAnimationFrame — game canvases
  screenshot black/frozen; Winamp logs a benign play() AbortError. Not bugs.
- Arcade changes: `node scripts/arcade-smoke.mjs` + vitest; verify in
  Chrome with `?touch=1` at phone width (forces cabinet on desktop).
- Artist slugs are full names (jd-pruitt, not jd) — public pages live at
  /<artist-slug> behind the LumenatiOnline sign-on intro (or Skip).

## Still Scott's (remind if asked, don't build)
- Twilio upgrade, then RENT_AUTOSEND=true (and FOLLOWUPS_AUTOSEND).
- Artist logins on the Team page (gates rent nudges + pool pushes).
- Sales-tax rate, recurring bills, live Stripe keys, GOOGLE_* keys, email
  domain (docs/owner-setup-checklist.md).
- Meta developer app for the Social redesign; Gusto account decision.
- Sunset Square cutover button: build only when Scott says go.
- The two Scott's-call items in docs/product-shape.md.
