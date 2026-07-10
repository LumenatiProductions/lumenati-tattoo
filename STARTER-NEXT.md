# Lumenati — next-session starter: ARCADE WRAP-UP

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

## State of THE ARCADE (built 2026-07-10, all committed + pushed)
- 9 playable games, each play-verified in Chrome on real room pages.
  Skate (levels: pigeons/ink spills/stacks, ink shield) in the template;
  Ink Snake / Flash Breaker / Sterile! / Needle Pong / Walk-In plus the
  second wave — Steady Hand (trace-the-stencil flagship), Shop Rush
  (front-of-house dash), Flash Match (pairs dealt from the room's own
  portfolio images) — live in `legacy/games/*.js` as drop-in IIFEs
  sharing the same Win98 window shell (600px chunky-pixel canvas). Every
  game has a level/wave/night/session ladder and self-sets its status-bar
  hint + labels at init.
- Demo rooms live for Scott's play-through (artists arcade-demo-*,
  inactive, OVERNIGHT-style disposable): snake, bricks, shooter, pong,
  frogger, steady, shoprush, flashmatch. SWEEP THEM when Scott is done
  playing (artists + room_content rows, service key).
- Renderer (`lib/admin/render-room.ts`, GAME_CATALOG): swaps the picked
  game's IIFE + exe title + hint into the shell; uploaded video swaps JD's
  Vimeo iframe for a <video> in the same WMP chrome. NULL fields = today's
  rooms exactly (JD skate+Vimeo, others neither). 9 tests in
  tests/render-room.test.ts; vitest green, tsc clean both sides.
- App My Room: Arcade game chip row + Room video add/replace/remove
  (mp4/mov, 60MB cap, uploads to the room-photos bucket — existing storage
  policies cover it, no new policies needed). Sections gate on the columns
  existing, so the app is safe pre-migration. NOT yet on phones (no eas
  update run).

## Priority 1 — one leftover migration
E2E is DONE (2026-07-10 afternoon, Scott's session): game_id/video_url
applied live; disposable artist picked Ink Snake + uploaded a video
through the app, second artist got Walk-In, both public rooms verified
in Chrome, JD byte-identical, test data swept to zero. Scott's polish
pass also shipped: per-game status-bar instructions (games set their
own at init), My Room spacing, pink standout Flash wall card, video
titles.

ONE thing left: `supabase/2026-07-10-room-video-title.sql` (additive
video_title) got classifier-blocked. Ask Scott to shift+tab and go:
`node scripts/apply-sql.mjs supabase/2026-07-10-room-video-title.sql`
The app's Video title field and the renderer filename swap are already
shipped and gate on the column existing, so nothing breaks meanwhile.

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers are already running (:3002 web, :8081 Metro). NEVER
  kill Metro. Shell cwd resets between calls — cd the repo first.
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`
  (SUPABASE_ACCESS_TOKEN in ~/.zshrc). This session even additive columns
  got classifier-blocked — expect to need Scott's go.
- Metro web CANNOT click buttons that call the Next API — prove API paths
  with curl + Bearer. Supabase-direct actions click fine in Chrome.
- New admin CSS goes in its own file (stale admin.css compile gotcha).
  Room pages are unaffected (legacy blocks are inline-styled).
- readLegacyBlock rewrites CDN URLs to /legacy-assets and adds
  loading=lazy — template assertions must expect the rewritten form.
- Verify UI in Chrome MCP (never computer-use). public/ stays slim; games
  are asset-free by design.
- No real sends (RENT_AUTOSEND / FOLLOWUPS_AUTOSEND stay off). No eas
  build/update without explicit go (before eas update set
  EXPO_PUBLIC_API_URL to https://lumenati-tattoo.vercel.app).

## Open / owed items (carry-over)
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.
- Tap to Pay go-live bundle: live Stripe keys, Apple production
  entitlement, real-phone done-screen check (sandbox proven).
- Owed: real 4x6 QR card print; artist push tokens need an artist login on
  a real phone.

## Still Scott's (remind if asked, don't build)
- Twilio upgrade, then RENT_AUTOSEND=true (and FOLLOWUPS_AUTOSEND).
- Artist logins on the Team page (gates rent nudges + pool pushes).
- Sales-tax rate, recurring bills, live Stripe keys, GOOGLE_* keys, email
  domain (docs/owner-setup-checklist.md).
- Meta developer app for the Social redesign; Gusto account decision.
- Sunset Square cutover button: build only when Scott says go.
