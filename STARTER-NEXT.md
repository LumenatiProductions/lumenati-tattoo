# Lumenati — next-session starter: OPEN THE GATE (Stripe) + POLISH THE FUNNEL

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
shop hours/policies/about pages.

## WHAT LUMENATI ACTUALLY SELLS (Scott, 2026-07-13 — I had this backwards)
The product is the BUSINESS BRAIN for a shop, not a booking widget. "Keep
your website" is a footnote, NOT the pitch — Scott never locked any pitch
(an earlier note wrongly said he did; do not treat any headline as locked).
Marketing must lead with benefits, split into TWO buyers:
- FOR THE ARTIST (focus = the APP/phones): coaches them, keeps their books,
  sends+texts follow-ups, sets goals + auto tax set-aside, real hourly rate,
  rewards/streaks — "run your chair like a business" (Robinhood energy).
- FOR THE SHOP (focus = the DESKTOP Command Center): revenue coaching + a
  read on what you can control, keeps the books (P&L/Reports/pay/rent), one
  goal the room races, retention that runs itself, no front desk.
Current /shops hero: "Everything but the tattoo." Two benefit sections with
Ionicons-style outline icons; artist=app phones, shop=desktop screens.

## Where things stand (2026-07-13, SELF-SERVE ARC BUILT this session)
- **Marketing page SHIPPED + REWORKED (code)**: `/shops` — its own
  scoped-CSS page in the Command Center family (liquid-ink wash, glass,
  brand pink), NOT Y2K. Reworked 2026-07-13 into the two-buyer benefits
  page above (hero "Everything but the tattoo"; artist section = app
  phones; shop section = desktop Command Center + Reports). Real product
  screens captured headlessly via scripts/marketing-shots.mjs (web, via
  Playwright borrowed from ~/cinebody-platform) + scripts/marketing-shots-
  app.mjs (the RN app via Scott's Metro web :8081). Demo tenant seeded with
  14 days of sales + shop/artist goals so every money screen reads real
  (scripts/seed-review-sales.mjs; goals set directly in DB). "shops" is in
  RESERVED_SLUGS. STILL OPEN: pricing section (Scott asked; needs real
  numbers — business-model memory has a $199+$79/seat THESIS, unconfirmed).
- **Wizard grew the three beats**: /start now has page-style chips
  (standard/dark/flash), optional logo upload (data URL -> service-role
  upload to room-photos/shop-logo/), and optional owner cell. A cell makes
  day-one sign-in a text code: auth user gets phone attached CONFIRMED
  (same pattern as /api/staff), profiles.phone set. Invite email still the
  anchor; if it bounces AND a phone exists, the user is created confirmed
  with both. Verified END TO END against prod (disposable tenant
  "wizard-test-parlor": dark skin + logo + phone all landed on the live
  page) then fully deleted (rows, storage object, auth user).
- **Get set up card SHIPPED**: owner home (/admin) now opens with a
  first-run checklist read live from the shop's own data — logo done?,
  every active artist has a profile photo?, every portfolio has shots?,
  plus a copy-your-page-link row. Self-retires when all done; Hide link
  (localStorage per shop); never shows for Y2K (Lumenati). Verified in
  Chrome as the App Review owner (sign in on 127.0.0.1 to keep Scott's
  localhost session untouched: +1 500 555 0100 / 000000).
- **Multi-tenant roster leak FIXED**: the web admin's artists context read
  ALL shops' artists (the reviewer owner saw 8, not 2 — same class as the
  app-native scoping gotcha). profiles.shop_id now threads from the admin
  layout through AdminShell into RoleProvider (useRole().shopId) and
  ArtistsProvider scopes .eq("shop_id", ...). Lumenati home verified
  unchanged after the fix. Other admin contexts (sales, clients, etc.) were
  NOT audited for the same leak — worth a pass when touching them.
- **Template-picker SQL RAN** (Scott applied it): shops.template check now
  allows dark/flash and authenticated can update the column. The app's Page
  style picker and the desktop Team page card are LIVE. The create API
  still carries a fallback-to-standard if a constraint ever rejects.
- Templates arc, flash tap-to-claim, demo tenant showcase: all done in
  prior sessions and unchanged — see git history.

## Priority 1 — open the gate + make the funnel real
1. **Stripe activation is the blocker Scott owns** (below). The moment it
   lands: wire the plan/payment beat into /start, drop SHOP_WIZARD_CODE,
   and the CTA path is fully self-serve. Do NOT build payment before the
   sk_live moment.
2. **Backlink field** (the one shop-presence item allowed by the hard
   line): shops.website -> "back to <shop site>" link on the crew landing
   + artist page footers. Small, sanctioned, not yet built.
3. **Funnel polish worth doing while waiting**: /shops could use one real
   product shot of the Command Center or app (Scott may want approval on
   whatever screenshot is used); marketing-page copy pass in Scott's voice.
4. Product-shape build order (fee engine -> SKU billing -> Passport,
   docs/product-shape.md) stays AFTER this arc.

## Waiting on Scott (remind, don't nag)
- STRIPE ACTIVATION -> paste sk_live -> flip server, record the $1 take
  (docs/app-store-checklist.md has the one-take script), refund, flip back.
- The real business numbers (docs/handoff-coo-bookkeeper.md): artist
  splits/rents, tax rate, bills, bank, payroll, 1099 yes/no.
- App Store portal: App Privacy questionnaire (answers pre-written in the
  checklist), privacy URL, then BUILD 21 GO (account deletion, iPhone-only,
  roster scoping, coach deck, books toggle, chart scrub — store build must
  be 21+).
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens.
- Older queued DDL: `grant select (books_closed) on artists to anon;`
  (supabase/2026-07-12-books-closed.sql; nothing breaks without it).
- game_id column drop (supabase/2026-07-11-drop-game-id.sql) ONLY after
  build 21 ships.
- Thumb on real glass: arcade cabinet, coach swipe, chart scrub (his phone
  has the local Xcode TTP build — fresh code needs a rebuild or build 21).

## How to work here (hard-won gotchas — trust these)
- Scott's dev servers run already (:3002 web, :8081 Metro). NEVER kill
  Metro. Shell cwd resets between calls — cd the repo first.
- STALE TAILWIND: the webpack persistent cache poisons compiled CSS —
  restarts alone DON'T fix it. Kill :3002, `rm -rf .next`, restart
  `npx next dev -p 3002`. (Web restarts fine; Metro never.) Also: dev-page
  form state can be wiped by a late Fast Refresh after edits — refill.
- Testing as another tenant WITHOUT touching Scott's session: sign in at
  http://127.0.0.1:3002/admin/login (separate cookie jar from localhost).
  App Review owner: phone (500) 555-0100, code 000000. Log out after.
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`. Additive
  columns pass; standalone grants/constraint swaps get classifier-blocked —
  queue for shift+tab.
- Tables with per-column grants (shops, artists): every NEW column needs
  explicit grants or reads/writes silently fail. room_content has
  full-table grants — new columns inherit there.
- Roster reads on BOTH surfaces MUST scope to the viewer's shop: app-native
  via useAuth().shopId, web admin via useRole().shopId (RLS does not wall
  public-read tables between shops).
- flash_pieces tracks `status` ('available'/'claimed'), NOT a `claimed`
  boolean. Sorting status asc puts available first.
- Reviewer session for Metro-web/API testing: test OTP (+15005550100 /
  000000), inject into localStorage sb-humjddiwzzanvvqztypy-auth-token;
  tokens die in 1h.
- Metro web CANNOT click Next-API buttons (CORS) — curl with a Bearer.
  Supabase-direct actions click fine. Grep served bundles to verify app
  code: `curl -s "http://localhost:8081/app/(app)/<route>.bundle?platform=web&dev=true" | grep -c <string>`.
- Verify UI in Chrome MCP (never computer-use). If the window won't resize
  to phone width, inject same-origin 390px iframes on a localhost page and
  screenshot (media queries track iframe width). To scroll inside an
  injected iframe use its contentWindow.scrollTo, not wheel events.
- readLegacyBlock rewrites CDN URLs + adds loading=lazy — template
  assertions expect the rewritten form. Arcade changes: arcade-smoke.mjs +
  vitest + ?touch=1 at phone width.
- Artist slugs are full names (jd-pruitt). Demo tenant = /s/apple-review
  (Sam Rivera = populated showcase, Max Doyle = empty-state showcase).
  Wizard code: SHOP_WIZARD_CODE in .env.local.

## Still Scott's (remind if asked, don't build)
- Twilio auth token + trial upgrade, then FOLLOWUPS/RENT autosend flips.
- Message-voice pass on the follow-up templates.
- Domain move off Squarespace -> Resend verify.
- GOOGLE_* keys for review tracking; Meta developer app (socials OAuth +
  Social redesign); Gusto decision.
- Sunset Square cutover button: build only when Scott says go.
- The two Scott's-call items in docs/product-shape.md (proration timing,
  move notice vs veto).
