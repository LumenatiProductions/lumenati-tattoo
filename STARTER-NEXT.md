# Lumenati — next-session starter: TEMPLATES, part two (dark ink + flash sheet + picker)

Read this first in a fresh context. Scott is NOT a coder: explain in plain
English, no jargon/file paths in chat. Never use emojis or em dashes. Dive
straight into Priority 1 — no questions, no menus. When Scott asks for "a
list", the answer is plain paste-able bullets in chat, nothing else first.

## What this is
A tattoo-shop management product Lumenati owns end to end. Two surfaces:
- **Web Command Center** (`/admin`, Next.js, dev on :3002) = admins.
- **Phone app** (`app-native`, Expo, Metro :8081) = artists + admin on the go.
Public layer: Y2K site at root (Lumenati's skin only). Owner login:
lumenati@icloud.com. Core principle: NO front desk. Square is historical
only; never flag its data quirks.

## THE HARD LINE (Scott, 2026-07-12 — do not let scope cross it)
Lumenati is NOT in the shop-website business. Artist pages are the hosted
product; shops keep their own sites and link to us. The shop's presence on
our pages = their logo (shipped) + a backlink field when needed. Never build
shop hours/policies/about pages. Pitch: "keep your website, we take over
everything behind it."

## Where things stand (2026-07-12 end of day, all committed + pushed)
Massive two-day run. In shipping order:
- **Deep pass done** (bugs/DB/security/App Store): FK repoint APPLIED live,
  demo rooms swept, anon+two-shop break-ins pass, cron lanes timing-safe,
  account deletion + /privacy shipped, reviewer demo tenant LIVE and proven
  (phone +1 500 555 0100 / code 000000, self-healing provision script).
- **Reviewer walk caught + fixed cross-shop leaks**: app rosters now scope
  to profiles.shop_id via auth context (artists/room_content are public-read
  so RLS can't wall them — APP-LEVEL scoping is mandatory); /api/reports'
  Square rent block and /api/reconcile's Stripe view pinned to
  LUMENATI_SHOP_ID. App is iPhone-only (kiosk iPad = web).
- **Tap to Pay recording saga**: EAS CANNOT build the restricted entitlement
  (ad hoc signing rejects it — three failed builds prove it). The working
  path: local Xcode build, dev-signed, installed on Scott's phone over wifi
  (entitlement verified inside). BLOCKED on Stripe activation: test mode
  DECLINES real cards (a recorded take died on this), so the video needs
  live keys + one real $1 + refund. Scott is activating Stripe.
- **Scott's asks shipped**: coach tips swipe-dismiss (CoachDeck, 14-day
  sit-out, next tip backfills), home reorg (attention up top, launcher
  regrouped), close-the-books v1 (My Page toggle -> public CTA becomes
  Waitlist -> asks land on waitlist -> reopen nudges with the count; the
  reopen day-picker scheduling idea is DEFERRED), Robinhood chart scrub
  (Animated glide + per-day ticks + end stops, WeekBars slide too).
- **Templates arc STARTED**: socials end to end (room_content.socials jsonb,
  app Socials card, Y2K icons + template links); MINIMAL PORTFOLIO v1 live
  at /s/<shop>/<artist> (niche statement, Ionicons social marks via shared
  SocialIcon component, flash-for-sale grid, promo banner, books-closed
  waitlist swap, phone-only sticky Book bar, artist's OWN accent color
  wins); root /<slug> redirects non-Lumenati artists to their shop's
  template (theme follows context); shop logo upload (Staff screen, one
  tap) renders on resident artists' pages.
- **Business homework docs**: docs/handoff-coo-bookkeeper.md (artist deal
  terms are PLACEHOLDERS — real numbers pending), waiver review CLOSED
  (Scott's call, LEGAL_COPY_REVIEWED=true in prod + local).

## Priority 1 — finish the templates arc
1. **Dark ink** skin: heavier atmosphere (smoke not white, blackwork/metal
   energy) — same data, same header unit (logo/name/niche/socials/Book).
2. **Flash sheet** skin: the wall-of-flash IS the page — grid-first, prices,
   tap to claim via the existing flash mechanics.
3. **Shop theme picker**: shops.template gains the new values; a simple
   picker (app, admin-only, like the logo card) + the /s renderer dispatches
   per template. Y2K stays hardcoded Lumenati.
4. Keep the header unit identical across skins; empty states intentional
   everywhere; verify each skin in Chrome at phone width.
Then continue product-shape build order (docs/product-shape.md): graduated
fee engine + transparency receipt -> SKU billing -> Passport flows. The
@handle vanity URL (artist-owned permanent link) is future work on that path.

## Waiting on Scott (remind, don't nag)
- STRIPE ACTIVATION -> paste sk_live -> flip server, record the $1 take
  (docs/app-store-checklist.md has the one-take script), refund, flip back.
- The real business numbers (docs/handoff-coo-bookkeeper.md): artist
  splits/rents, tax rate, bills, bank, payroll, 1099 yes/no.
- App Store portal: App Privacy questionnaire (answers pre-written in the
  checklist), privacy URL, then BUILD 21 GO (it carries account deletion,
  iPhone-only flag, roster scoping, coach deck, books toggle, chart scrub —
  the store build must be 21+).
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.
- Queued DDL for a manual-mode moment: `grant select (books_closed) on
  artists to anon;` (in supabase/2026-07-12-books-closed.sql; nothing
  breaks without it — server-side reads cover it).
- game_id column drop (supabase/2026-07-11-drop-game-id.sql) ONLY after
  build 21 ships.
- Thumb on real glass: arcade cabinet, coach swipe, chart scrub (his phone
  currently has the local Xcode TTP build — fresh code needs a rebuild or
  build 21).

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers run already (:3002 web, :8081 Metro). NEVER kill
  Metro. Shell cwd resets between calls — cd the repo first.
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`. Additive
  columns (even with their grants in the same file) have been passing;
  standalone grants/deletes get classifier-blocked — queue for shift+tab.
- STALE-TAILWIND GOTCHA: the long-running dev server silently drops
  never-before-used Tailwind utilities. New styling in /s pages = custom
  classes in app/s/s.css (see .book-bar), or Scott restarts the server.
- Tables with per-column grants (shops, artists): every NEW column needs
  explicit grants or reads/writes silently fail. room_content has
  full-table grants — new columns inherit there.
- App-native roster/public-table reads MUST scope .eq("shop_id", shopId)
  from useAuth — RLS does not wall public-read tables between shops.
- Reviewer session for Metro-web/API testing: sign in via test OTP
  (+15005550100/000000, script pattern in git history), inject into
  localStorage sb-humjddiwzzanvvqztypy-auth-token; tokens die in 1h.
- Metro web CANNOT click Next-API buttons (CORS) — curl with a Bearer.
  Supabase-direct actions click fine. Grep served bundles to verify app
  code: `curl -s "http://localhost:8081/app/(app)/<route>.bundle?platform=web&dev=true" | grep -c <string>`.
- Verify UI in Chrome MCP (never computer-use). Occluded tabs freeze rAF
  (black canvases) and Winamp logs a benign play() AbortError — not bugs.
- readLegacyBlock rewrites CDN URLs + adds loading=lazy — template
  assertions expect the rewritten form. Arcade changes: arcade-smoke.mjs +
  vitest + ?touch=1 at phone width.
- Artist slugs are full names (jd-pruitt). Demo tenant = /s/apple-review
  (Sam Rivera has socials, a promo, orange accent, stand-in logo — the
  template showcase page).

## Still Scott's (remind if asked, don't build)
- Twilio auth token + trial upgrade, then FOLLOWUPS/RENT autosend flips.
- Artist logins on the Team page; message-voice pass on the four templates.
- Domain move off Squarespace -> Resend verify.
- GOOGLE_* keys for review tracking; Meta developer app (socials OAuth +
  Social redesign); Gusto decision.
- Sunset Square cutover button: build only when Scott says go.
- The two Scott's-call items in docs/product-shape.md (proration timing,
  move notice vs veto).
