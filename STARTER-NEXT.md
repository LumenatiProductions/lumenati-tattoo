# Lumenati — next-session starter: SELF-SERVE ONBOARDING + MARKETING PAGE

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

## Where things stand (2026-07-12, templates arc COMPLETE in code)
- **TEMPLATES ARC DONE (this session)**: three artist-page skins over one
  data model — minimal ('standard'), **dark ink** ('dark', smoke-not-white
  atmosphere, uppercase name, hairline rules, tighter grid), **flash sheet**
  ('flash', the sheet IS the page: claim bar + price per tile, CLAIMED
  stamps, portfolio demoted to a strip). Header unit (logo/name/niche/
  socials/Book) is ONE shared component across skins. `?skin=` on any /s
  artist URL previews a skin without touching the stored choice. Dark shops'
  crew landing page wears the smoke too.
- **Flash tap-to-claim shipped**: every flash tile (all skins) links to
  /request?flash=<id>; the form shows the piece (thumb/title/price), seeds
  the idea text, preselects the artist. Claimed/foreign ids degrade to a
  normal request. Also FIXED a live bug: the flash query asked for a
  `claimed` column that never existed (table has `status`) — the flash grid
  had never actually rendered.
- **App theme picker shipped (code)**: Staff screen "Page style" card under
  the logo card, admin-only, three chips + blurb; hidden for Lumenati (Y2K
  stays hardcoded). BLOCKED on the queued SQL below — until it runs, the
  shops.template check constraint still only allows 'standard'/'y2k' and
  authenticated has no update grant, so the picker's save fails.
- **Demo tenant is the showcase**: Sam Rivera (/s/apple-review/sam-rivera)
  now has profile, 6 real tattoo portfolio shots, 4 flash pieces (1 claimed)
  — scripts/seed-review-flash.mjs re-seeds it. Max Doyle stays empty on
  purpose (the empty-state showcase). All three skins + claim flow verified
  in Chrome at phone width; empty states verified on Max.
- Everything from the prior two-day run (deep pass, reviewer tenant, TTP
  saga, coach deck, close-the-books, chart scrub) is unchanged — see git
  history if needed.

## Priority 1 — make it a real product people can join themselves (Scott, 2026-07-12)
Scott's words: "Shouldn't we make it so people can just do it themselves?
We will need a marketing page but I feel like that's how a real product
works." Aim everything at that.

What already exists (don't rebuild it):
- A full tenant wizard at /start — shop name/tagline/accent, crew list,
  owner email; provisions shop + artists + room_content + owner invite in
  one shot via /api/shops/create. Invite-gated by ?code= (SHOP_WIZARD_CODE)
  on purpose while Scott co-builds. Slug collisions + reserved routes
  handled server-side.
- The hosted product itself: three page skins + picker (app AND desktop
  Team page), logo upload, booking/waitlist, the whole Command Center.

The build order:
1. **Marketing page** — the front door that sells artist pages + Command
   Center to OTHER shops. Pitch line is locked: "keep your website, we
   take over everything behind it." Show the three skins (live demo links
   to /s/apple-review/sam-rivera with ?skin=), the phone app, the no-front-
   desk story. DECISION NEEDED FROM SCOTT before building far: where does
   it live? The root is Lumenati-the-shop's Y2K site (its own skin, hands
   off), so the product pitch needs its own home — a route like /pro as a
   stopgap, or the real answer, a product name + domain. Ask him ONCE,
   early, with a recommendation; default to a clean route on this app if
   he hasn't decided.
2. **Wizard grows the missing beats**: logo upload + page-style pick right
   in /start (both are one-tap now, settings exist), and phone number for
   the owner so day-one sign-in is a text code (invite email already
   works). Keep it three beats, don't bloat it.
3. **Open the gate deliberately**: marketing page CTA -> /start. Keep the
   invite code until Stripe activation lands (no pricing wired = free
   co-building cohort), then the code drops and a plan/payment beat slots
   into the wizard. Do NOT build payment before Stripe activation (still
   waiting on Scott, see below).
4. **Onboarding aftercare**: the first-run experience once the owner lands
   in the Command Center — the existing owner-setup-checklist.md content
   should become the in-product "get set up" card, not a doc.
Product-shape build order (fee engine -> SKU billing -> Passport,
docs/product-shape.md) moves to after this arc. Templates are DONE — don't
reopen unless Scott flags something.

## Waiting on Scott (remind, don't nag)
- **QUEUED SQL (new)**: `node scripts/apply-sql.mjs supabase/2026-07-12-template-picker.sql`
  — widens the shops.template check to add 'dark'/'flash' + grants
  authenticated update on that one column. Classifier-blocked for me
  (grant); needs a shift+tab manual-mode moment. The app's Page style
  picker does nothing until this runs.
- STRIPE ACTIVATION -> paste sk_live -> flip server, record the $1 take
  (docs/app-store-checklist.md has the one-take script), refund, flip back.
- The real business numbers (docs/handoff-coo-bookkeeper.md): artist
  splits/rents, tax rate, bills, bank, payroll, 1099 yes/no.
- App Store portal: App Privacy questionnaire (answers pre-written in the
  checklist), privacy URL, then BUILD 21 GO (account deletion, iPhone-only,
  roster scoping, coach deck, books toggle, chart scrub — store build must
  be 21+). The theme picker rides whatever build follows the SQL.
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
- STALE-TAILWIND ROOT CAUSE FOUND (this session): the webpack persistent
  cache poisons the compiled s.css — restarts alone DON'T fix it; custom
  classes didn't serve either. The fix: kill :3002, `rm -rf .next`, restart
  `npx next dev -p 3002`. (Web server restarts are fine; Metro is the one
  you never touch.)
- Live DB DDL: `node scripts/apply-sql.mjs supabase/<file>.sql`. Additive
  columns (grants in same file) pass; standalone grants/constraint swaps
  get classifier-blocked — queue for shift+tab.
- Tables with per-column grants (shops, artists): every NEW column needs
  explicit grants or reads/writes silently fail. room_content has
  full-table grants — new columns inherit there.
- flash_pieces tracks `status` ('available'/'claimed'), NOT a `claimed`
  boolean. Sorting status asc puts available first.
- App-native roster/public-table reads MUST scope .eq("shop_id", shopId)
  from useAuth — RLS does not wall public-read tables between shops.
- Reviewer session for Metro-web/API testing: sign in via test OTP
  (+15005550100/000000, script pattern in git history), inject into
  localStorage sb-humjddiwzzanvvqztypy-auth-token; tokens die in 1h.
- Metro web CANNOT click Next-API buttons (CORS) — curl with a Bearer.
  Supabase-direct actions click fine. Grep served bundles to verify app
  code: `curl -s "http://localhost:8081/app/(app)/<route>.bundle?platform=web&dev=true" | grep -c <string>`.
- Verify UI in Chrome MCP (never computer-use). If the window won't resize
  to phone width, inject same-origin 390px iframes on a localhost page and
  screenshot all skins side by side — media queries track iframe width.
- readLegacyBlock rewrites CDN URLs + adds loading=lazy — template
  assertions expect the rewritten form. Arcade changes: arcade-smoke.mjs +
  vitest + ?touch=1 at phone width.
- Artist slugs are full names (jd-pruitt). Demo tenant = /s/apple-review
  (Sam Rivera = populated showcase, Max Doyle = empty-state showcase).

## Still Scott's (remind if asked, don't build)
- Twilio auth token + trial upgrade, then FOLLOWUPS/RENT autosend flips.
- Artist logins on the Team page; message-voice pass on the four templates.
- Domain move off Squarespace -> Resend verify.
- GOOGLE_* keys for review tracking; Meta developer app (socials OAuth +
  Social redesign); Gusto decision.
- Sunset Square cutover button: build only when Scott says go.
- The two Scott's-call items in docs/product-shape.md (proration timing,
  move notice vs veto).
