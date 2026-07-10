# Lumenati — next-session starter: THE ARCADE

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

Backlog status: the 2026-07-08 page-walk items 1-5, the up-for-grabs pool,
the flash wall, the site perf pass, and the mobile Command Center ALL
shipped (2026-07-08..10). Social (item 7) is blocked on Meta/IG API access.

## THE MISSION (Scott, 2026-07-10, verbatim intent)
"Build like 5 different video games like JD's skate game... we could
probably make that better now too with Fable 5. Artists get to choose which
game is on their room, and also let people upload videos to the video
button. Basically carry all the JD options to everywhere but allow the
artists to customize them."

Three deliverables:

### 1. The game catalog (~5 new games + a better skate game)
JD's room has a Win98-style game window: a `<canvas>` in Tahoma window
chrome with Score/Lives in the status bar, opened by the desktop "Games"
icon. In `legacy/artist-page-y2k.html`: icon ~line 748, game window +
canvas ~894, the game IIFE ~906-1440, click wiring ~1442, mobile buttons
`jd-mob-game`/`jd-mob-skate`. Build ~5 more games in exactly that shell —
same window chrome, keyboard AND touch controls, era-true Y2K arcade feel,
each one a self-contained IIFE with zero dependencies and zero downloaded
assets. Era-appropriate candidates (give them tattoo-shop-flavored twists):
Snake, brick breaker, asteroids/space shooter, Pong vs CPU, a runner.
ALSO: improve the skate game itself (physics, feel, polish) — Scott expects
it to get better with Fable 5. Keep controls dead simple.

### 2. Artists pick their game + their video (My Room in the app)
- `room_content` gains `game_id text` and `video_url text` (ADDITIVE
  `alter table add column` — passes the auto-mode classifier; new
  policies/functions/triggers would NOT, see gotchas). NULL = today's
  behavior: JD keeps skate + his hardcoded Vimeo clip, others have neither.
- renderRoomHtml (`lib/admin/render-room.ts`): today it STRIPS the JD-only
  extras for `!isJd` ("Strip JD-only extras" block). Invert: every room
  gets the Games + Video icons when the artist picked one; inject the
  chosen game's IIFE and the artist's video. Follow the sticker/poster
  pattern (STICKER_CATALOG in the same file: catalog + null-means-classic).
- Video: artist uploads a clip from the phone. New PUBLIC storage bucket
  (service-role creation like room-photos; bucket creation passes the
  classifier). Cap size (~60MB) and type (mp4/mov). The room's video window
  becomes a `<video>` tag when video_url is set; JD's Vimeo iframe stays
  his default until he uploads his own. App picker: `uploadFromLibrary` in
  `app-native/app/(app)/room.tsx` is images-only (expo-image-picker) —
  extend mediaTypes for video and route to the video bucket.
- My Room UI: a "Game" chip row (matches the sticker picker style) + a
  Video row (upload / replace / remove). Include picks in select/save like
  stickers/posters: web mapping `lib/admin/room-data.ts`, seeds
  `lib/admin/room-seed.ts`, RoomContent type `lib/admin/types.ts`.

### 3. Mobile buttons too
Carry the template's mobile-btn equivalents to every room with the same
conditional logic.

## Definition of done
- 6 playable games (skate improved + ~5 new), each verified by PLAYING it
  in Chrome on a real room page — press the keys, score points, lose a
  life. Watch-the-output rule: never claim a game works without playing it.
- A disposable artist picks a game + uploads a video in the app; their
  public room shows both. A second artist picks a different game; the rooms
  differ. JD's room pixel-identical while his new fields stay NULL.
- Renderer assertions extended, tsc clean both sides, vitest green,
  commit + push per game/feature.

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers are already running (:3002 web, :8081 Metro). NEVER
  kill Metro. Shell cwd resets between calls — cd the repo first.
- Live DB DDL: SQL file in supabase/, apply with
  `node scripts/apply-sql.mjs supabase/<file>.sql` (SUPABASE_ACCESS_TOKEN
  in ~/.zshrc). Additive columns/buckets pass auto mode; policies/functions
  get classifier-blocked — build everything else first, then ask Scott to
  shift+tab and say go. If a compound command is denied, NOTHING in it ran
  (including any heredoc file-write — recheck the file exists).
- Disposable identities: full recipe in memory
  reference_lumenati_test_identity. Short form: auth user + profiles row
  (keyed by EMAIL, no id column: email/role/artist_id/shop_id, shop
  11111111-…) via service key; password-grant; on localhost:8081 go to
  /sign-in, wait 3s, inject `sb-humjddiwzzanvvqztypy-auth-token` into
  localStorage, navigate. Test data screams OVERNIGHT TEST; delete + sweep
  same session; clear the injected token.
- Metro web CANNOT click buttons that call the Next API (app points at the
  prod deploy; browsers block cross-site) — prove API paths with curl +
  Bearer. Supabase-direct actions click fine in Chrome.
- The long-running web dev server serves a STALE compile of admin.css — a
  Tailwind class never used in /admin before silently doesn't exist. New
  admin CSS goes in its own file (see app/admin/phone.css). Room pages are
  unaffected (legacy blocks are inline-styled).
- readLegacyBlock rewrites Squarespace CDN URLs to /legacy-assets AND adds
  loading=lazy to imgs — template assertions must expect the rewritten form.
- Verify UI in Chrome MCP (never computer-use); window resize works now.
- public/ was slimmed 80MB -> 33MB; keep new games asset-free, compress any
  new media with sharp (already in node_modules).
- No real sends (RENT_AUTOSEND / FOLLOWUPS_AUTOSEND stay off; deposit 0 in
  tests mints no Stripe links). No eas build/update without explicit go.
- Web dev server if needed: `npx next dev -p 3002` (plain dev binds 3000).

## Open / owed items (carry-over)
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.
- Tap to Pay go-live bundle: live Stripe keys, Apple production
  entitlement, real-phone done-screen check (sandbox proven).
- App changes are OTA-safe but NOT on phones until Scott approves a build
  or eas update (before eas update set EXPO_PUBLIC_API_URL to
  https://lumenati-tattoo.vercel.app).
- Owed: real 4x6 QR card print; artist push tokens need an artist login on
  a real phone.

## Still Scott's (remind if asked, don't build)
- Twilio upgrade, then RENT_AUTOSEND=true (and FOLLOWUPS_AUTOSEND).
- Artist logins on the Team page (gates rent nudges + pool pushes).
- Sales-tax rate, recurring bills, live Stripe keys, GOOGLE_* keys, email
  domain (docs/owner-setup-checklist.md).
- Meta developer app for the Social redesign; Gusto account decision.
- Sunset Square cutover button: build only when Scott says go.
