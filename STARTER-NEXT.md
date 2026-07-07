# Lumenati — next-session starter

Read this first in a fresh context. Scott is NOT a coder: explain in plain
English, no jargon/file paths in chat. Never use emojis or em dashes.

## What this is
A tattoo-shop management product Lumenati owns end to end, replacing Square
(POS) and QuickBooks (books) — now growing into a SaaS for every tattoo shop
(the /start wizard exists, invite-gated). Two surfaces, ROLE-BASED:
- **Web Command Center** (`/admin`, Next.js, dev on :3002) = admins.
- **Phone app** (`app-native`, Expo) = artists (phone-only) + admin on the go.
Public layer: Lumenati's Y2K site at the root (its custom SKIN) + the
standard template at /s/<shop> for every other shop (same room_content data,
different skin — shops.template picks). Owner login: lumenati@icloud.com.
Money: cash + Stripe only, everything through the append-only ledger.

## THE MISSION (Scott greenlit 2026-07-07): data walls, then a deep QA +
## security dive. In that order.

### 1) DATA WALLS — shop-scoped RLS
Today every tenant table carries shop_id (M2 seam, backfilled to Lumenati's
fixed id 11111111-1111-1111-1111-111111111111) and `current_shop_id()` reads
profiles.shop_id — but NO policy checks it. A second shop's ADMIN or artist
still sees Lumenati's everything. This is THE blocker before any outside
shop gets a wizard code. The work:
- Sweep EVERY tenant table's policies to add `shop_id = current_shop_id()`
  (reads AND writes; with-check too). ~26 seam tables plus the new ones:
  artist_campaigns, artist_client_notes, waitlist, slot_offers,
  review_snapshots.
- Public/anon paths stay by-capability or by-shop-scoped-query (healed/care/
  claim tokens, /s pages, room pages, active campaigns) — verify each still
  works for BOTH shops after the sweep.
- Server routes using the service-role client BYPASS RLS — audit each
  /api/* route for explicit shop scoping (payment-intent, followups job,
  ops jobs, claim, offer, shops/create, reviews…). The ops/cron jobs loop
  over Lumenati implicitly today (e.g. week-review reads ALL artists) —
  they must group by shop or filter.
- INSERT defaults: shop_id defaults to Lumenati on every table — a second
  shop's app writes would land in Lumenati's books unless the default is
  replaced by a trigger reading current_shop_id() (probably the right
  call) or explicit values everywhere.
- Auth helpers: my_role()/my_artist() read profiles by auth.email() —
  fine, but confirm one-shop-per-login holds (profiles PK is email).
- Test with TWO shops: the disposable-identity recipe below, one identity
  per shop, prove cross-shop reads/writes fail EVERYWHERE (REST allow/deny
  matrix like this session's artist checks, plus admin pages in Chrome).

### 2) DEEP QA + SECURITY DIVE (after the walls)
- Run scripts/rls-breakin-test.mjs (exists; parses env defensively) and
  extend it to the new tables + the two-shop matrix.
- Anon probes: every table via PostgREST with the anon key (column-grant
  gotcha: table-level revoke first or column grants are no-ops).
  shops.sales_tax_bps is already verified hidden.
- Capability tokens: healed (uuid + window), care (60d), claim (offer uuid
  + wl id) — windows, status transitions, cancelled/expired offers can't
  book, claims can't fire for inactive entries.
- API auth sweep: every /api route — who gates it (cookie staff() vs
  resolveStaff vs userFromBearer vs CRON_SECRET vs capability)? Any route
  with NO gate? (/api/claim and /api/care are deliberately public.)
- Money: penny-verify P&L + ledger invariants after any schema change;
  ledger_block_mutate trigger intact; cash→ledger sync idempotent.
- Launch secrets (memory project_launch_secrets): are .env files tracked?
  rotate anything ever committed; Supabase PAT in ~/.zshrc expires
  2026-07-31.
- Small warts to sweep while in there: artists have no bookings UPDATE
  policy (can't cancel their own — decide if intended); /request writes
  land on the default shop; wizard should block reserved slugs beyond
  "start" ("s", "admin", "claim", "care", "healed", "pay", "request",
  "kiosk", "api"); EditBooking reminder route auth.

## The disposable-identity test recipe (used all session, works great)
1. Create the auth user via the Supabase admin API (service key in
   .env.local); artists/profiles rows via Management API SQL (PAT in
   ~/.zshrc, project ref humjddiwzzanvvqztypy; ALWAYS `notify pgrst,
   'reload schema'` after DDL).
2. Password-grant a session, hit PostgREST with anon key + Bearer for
   allow/deny checks (expect 201/403/empty).
3. UI: inject the session JSON into localStorage
   (sb-humjddiwzzanvvqztypy-auth-token) on localhost:8081 (Metro web), or
   ride Scott's live admin cookie on :3002. SET IT ON THE RIGHT ORIGIN —
   localStorage is per-origin (got bitten once).
4. DELETE EVERYTHING after: rows, auth user, localStorage, token files.
   Gotchas: profiles.artist_id FK points at room_content (live drift!) so
   insert the room_content row first; artists needs slug (globally
   unique); UID is a readonly zsh variable (use TESTUID); artist row ids
   are NOT their slugs (J.D.'s id ≠ 'jd-pruitt') — always subquery by slug.

## Environment gotchas (hard-won 2026-07-06/07)
- Expo web works now (@opentelemetry/api dep + a Stripe Terminal web stub
  in app-native/metro.config.js) — app screens are verifiable in Chrome at
  localhost:8081. Reuse Scott's Metro if one is running.
- Web dev server: `npx next dev -p 3002` (plain `npm run dev` binds 3000).
- This Tailwind-v4 setup does NOT reliably compile utility classes that
  first appear in a brand-new file (bg-emerald-400 and w-3 came out
  empty) — inline styles for anything that must render; check computed
  styles before trusting new classes in new files.
- App booking writes must be real instants (toISOString) — bare local
  strings get read as UTC by Postgres (fixed everywhere; don't regress).
- SHOP_WIZARD_CODE=lumenati-pilot is in local .env.local only; unset in
  prod = wizard closed.

## Current state (compressed — all verified, all pushed)
- Artist-favorite five SHIPPED 2026-07-06: rebook-at-the-paid-moment (both
  registers), QR booking cards (print 4x6 at /admin/card/<slug> + app
  save/share), client memory (My clients + private artist_client_notes +
  been-a-while nudges), Sunday week-in-review push (/api/ops/weekly cron;
  ?dry=1&at=<ISO> QA levers), aftercare timeline (/care/<followup-uuid>,
  linked from the aftercare email; day-14 healed ask wired).
- Also shipped 2026-07-06/07: artist Promos (live banner on their public
  page), waitlist + no-show defense (cancel moment → fill the slot), slot
  offers ("text the list — first tap gets it": atomic claim race at
  /claim/<offer>/<entry>, honest about Twilio trial), review velocity on
  Reports (daily snapshots + asks-vs-gained chart; Places API auto-feed
  once Scott adds GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID), shop wizard +
  standard template (/start, /s/<shop>).
- Button system: full-width Button = the screen's ONE next action (one
  pink bar at a time); shared ActionPill (app-native/components/ui.tsx) =
  every in-row verb.
- App changes since the 2026-07-05 TestFlight build are OTA-safe (pure JS;
  react-native-qrcode-svg rides the existing react-native-svg) but NOT on
  phones until Scott approves a build or eas update (NEVER build without
  his explicit go; before eas update, point EXPO_PUBLIC_API_URL at
  https://lumenati-tattoo.vercel.app).
- Owed small items: one real 4x6 print of a QR card; the Tap to Pay done
  screen seen on a real phone; artist push tokens don't exist yet (the
  week-review push is unobserved until an artist logs into the app on a
  real phone).

## Scott's external checklist (gates launch — docs/owner-setup-checklist.md)
- Twilio TRIAL upgrade — now the highest-leverage item: unlocks slot-offer
  texts, reminders, phone-code logins, promo blasts.
- Sales-tax rate on P&L; real recurring bills on Expenses.
- GOOGLE_REVIEW_URL (review asks point nowhere without it),
  GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID (auto review tracking), move
  email domain + RESEND_FROM, live Stripe keys + webhook secret, legal
  review of consent copy, FOLLOWUPS_AUTOSEND=true.

## How to work
- Web: `npx next dev -p 3002`; deploy = push main (Vercel). Verify money to
  the penny; verify UI by clicking it in Chrome.
- DB: SQL via the Management API (memory reference_lumenati_supabase_db).
  Schema files and the live DB DRIFT — verify live state, don't trust
  files.
- Commit style: what shipped + how it was verified; push when green.
