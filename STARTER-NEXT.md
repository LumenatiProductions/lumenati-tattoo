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

## THE MISSION THIS SESSION: WALK EVERY PAGE WITH SCOTT (his call, 2026-07-08)
Scott wants to go page by page through the WHOLE product and give feedback on
each. Do NOT batch-audit or fan out — this is interactive. For each page: open
it (web admin in Chrome on :3002; app screens in Metro web on :8081 via the
disposable-artist session recipe; public pages direct), show it / describe what
it does, and ask Scott for his feedback. Move at HIS pace, one page at a time,
capture what he wants changed, and only then act. Keep a running list of his
notes so nothing drops. Start wherever he wants; default order = the inventory
below (admin first, then app, then public).

Full page inventory (walk all of these):
- WEB ADMIN (:3002/admin): Overview, My Room (/room), Bookings, Clients, Intake,
  Follow-ups, Social, Profit & Loss (/pnl), Reports, Payouts, Booth Rent (/rent),
  Cash Log (/cash), Expenses, Reconciliation (/reconcile), Artists & Pay
  (/artists), Inventory, Compliance, Staff, Integrations, + QR card (/card/<slug>)
  and Login.
- PHONE APP (:8081, signed-in): home, bookings, cash, cashout, clients,
  my-clients, compliance, expenses, followups, goals, healed-shots, intake,
  integrations, inventory, payouts, pos, promos, qr-card, reconcile, rent,
  reports, room, social, staff, waitlist (+ sign-in).
- PUBLIC: Y2K root site + /(site)/[artist] + /book + /contact (Lumenati skin);
  standard template /s/<shop> + /s/<shop>/<artist>; /request; /pay/<token>;
  /intake/<token>; /care/<token>; /healed/<token>; /claim/<offer>/<entry>;
  /kiosk; /start wizard.

## PARKED (scoped, do NOT build unless Scott says go): auto-deductions
Full scope in repo `AUTO-DEDUCTIONS-PLAN.md`. Artist links the account they buy
supplies with (bank/card via an aggregator like Plaid — we never see card
numbers), the app auto-catches business charges, artist taps to confirm, it feeds
their deductions + makes the tax set-aside real. Backbone is the ACCOUNT FEED
(catches online supply orders receipts-photos miss); email-forwarding for
itemized detail is phase 2. Post-launch, opt-in per artist (per-account cost).
Open decisions: who pays the fee, artist-only vs owner rollup, aggregator choice.

## DONE 2026-07-07/08 (all shipped, verified, pushed)

### Data walls (2026-07-07)
- **RLS**: every role/identity policy also requires shop_id =
  current_shop_id() (reads AND with-check); only the deliberate public reads
  stay open. Column defaults are gone — a BEFORE INSERT trigger stamps the
  writer's own shop. Applied LIVE + captured in
  supabase/2026-07-07-shop-rls-walls.sql.
- **Service-role routes**: api-auth resolves shopId (cookie + Bearer);
  every admin-client query the audit flagged is explicitly shop-scoped
  (refunds, merge, staff, ledger export, pnl, reports, reconcile,
  settlements, payouts, connect, POS, tap-to-pay, waitlist offers, claim,
  healed, kiosk+Square+Twilio pinned to Lumenati, tax-rate reads own shop).
  Cron jobs iterate shops (followups, brief, push reminders) or pin Lumenati
  (Square sync). createPaymentLink/pushEvent/merch helpers REQUIRE a shop.
- **/request belongs to a shop now**: /s/<shop> artist pages carry the slug,
  the form posts it; bare /request = Lumenati (unchanged).
- **Wizard** blocks all reserved slugs (s, admin, api, care, claim, healed,
  intake, kiosk, login, pay, request, start, auth).
- **Verified**: tsc clean; 18/18 tests; scripts/rls-breakin-test.mjs now 31
  tables PASS; NEW scripts/two-shop-breakin.mjs builds a disposable second
  shop, proves cross-shop reads/writes fail everywhere (REST allow/deny,
  trigger stamping, cross-shop UPDATE no-op, Bearer /api probes), cleans to
  zero rows, PASS; P&L + Reports penny-match the ledger ($48,777.00 YTD
  exact); admin pages clicked in Chrome. Pushed to main (Vercel deployed).
- **QA sweep also done**: capability windows enforced (care 60d, healed 60d +
  3 uploads + 4MB, claim can't book cancelled/expired/inactive); no tracked
  .env files, examples clean; authenticated role now sees only public shops
  columns (sales_tax_bps is server-only).

## Open decisions / owed items
- **Artist cancel SHIPPED 2026-07-07** (Scott greenlit): RLS policy + guard
  trigger let an artist cancel their own scheduled booking (status-only,
  deposit auto-refunds); Cancel button on their app rows. Reschedule by an
  artist is still staff-only — open if Scott wants that too.
- Supabase PAT in ~/.zshrc EXPIRES 2026-07-31 — regenerate at
  supabase.com/dashboard/account/tokens before it lapses.
- **SECOND-SHOP DRY RUN PASSED 2026-07-07** (disposable "Dry Run Ink Co",
  torn down clean): wizard provisions shop+artists+owner; standard template
  renders the shop's own data + accent; a public booking request lands on the
  new shop not Lumenati; a second-shop artist logs into the app and sees only
  their empty world (0 of Lumenati's 895 clients). Fixed on the way: the
  "Book with <artist>" deep-link now preselects that artist in /request.
- **Branding: Lumenati IS the product name** (Scott, 2026-07-08). The app being
  called Lumenati, and "powered by Lumenati" on shop pages/emails, is CORRECT
  and stays for every shop. Only a shop's OWN surfaces flip to their brand. Per-
  shop branding DONE 2026-07-08: /request form (button + eyebrow use the shop's
  accent), daily owner push title, morning-brief email (wordmark/footer/from/
  subject + accent dot), compliance alert email, and follow-up messages to
  clients (shop_name token + email From resolve to the client's real shop).
  Lumenati's own notifications unchanged. Do NOT strip Lumenati from the app
  chrome or the "Powered by Lumenati" signature. Stripe Terminal location
  hardcoded to Lumenati's address is fine (the physical device is Lumenati's).
  STILL Lumenati-flavored (design, not a name string, left for later): the
  follow-up EMAIL shell is the Y2K window style for every shop.
- **Bug reporter SHIPPED 2026-07-08** (Cinebody-style screenshot reporter):
  floating "Report a bug" pill on web admin + phone app -> screenshot + note ->
  bug_reports table + private bug-reports bucket + Slack ping with a signed
  screenshot link. Web works now. APP screenshots need ONE EAS build to include
  react-native-view-shot (guarded require -> note-only until then, never
  crashes); the reporter itself is OTA-safe, only the native capture waits on a
  build. No AI draft (kept tiny); add an /admin triage page later if Slack
  isn't enough.
- Owed small items: one real 4x6 print of a QR card; Tap to Pay done screen
  on a real phone; artist push tokens (week-review push unobserved until an
  artist logs into the app on a real phone).
- App changes since the 2026-07-05 TestFlight build are OTA-safe but not on
  phones until Scott approves a build or eas update (NEVER build without his
  explicit go; before eas update point EXPO_PUBLIC_API_URL at
  https://lumenati-tattoo.vercel.app).

## After the page walk (Scott's standing backlog)
- Second-shop dry run + per-shop branding are DONE (see above). Remaining big
  rocks: the parked auto-deductions feature (AUTO-DEDUCTIONS-PLAN.md), an EAS
  build to light up phone screenshots + push tokens, and Scott's external
  checklist (Twilio upgrade is the highest-leverage unlock).

## The disposable-identity test recipe (battle-tested)
scripts/two-shop-breakin.mjs is now the automated version (creates shop
22222222-… "rls-test-shop" + owner/artist, matrix, full cleanup; --keep to
inspect). For manual pokes the old recipe still works:
1. Auth user via Supabase admin API (service key in .env.local);
   artists/profiles via Management API SQL (PAT in ~/.zshrc, ref
   humjddiwzzanvvqztypy; ALWAYS `notify pgrst, 'reload schema'` after DDL).
2. Password-grant a session, hit PostgREST with anon key + Bearer.
3. UI: inject session JSON into localStorage
   (sb-humjddiwzzanvvqztypy-auth-token) on localhost:8081, or ride Scott's
   admin cookie on :3002. RIGHT ORIGIN — localStorage is per-origin.
4. DELETE EVERYTHING after. Gotchas: profiles.artist_id FK points at
   room_content (insert that first); artists.slug globally unique; UID is a
   readonly zsh variable (use TESTUID); artist ids are NOT their slugs.

## Environment gotchas (hard-won)
- Expo web works (@opentelemetry/api + Stripe Terminal stub in
  app-native/metro.config.js) — app screens verifiable in Chrome at
  localhost:8081. Reuse Scott's Metro if one is running.
- Web dev server: `npx next dev -p 3002` (plain `npm run dev` binds 3000).
- Tailwind v4 here can silently not compile utility classes that first
  appear in a brand-new file — inline styles for must-render bits; check
  computed styles before trusting new classes in new files.
- App booking writes must be real instants (toISOString) — bare local
  strings get read as UTC by Postgres.
- SHOP_WIZARD_CODE=lumenati-pilot is local-only; unset in prod = wizard
  closed.
- Schema files and the live DB DRIFT — verify live state (Management API),
  don't trust files.

## Scott's external checklist (gates launch — docs/owner-setup-checklist.md)
- Twilio TRIAL upgrade — highest leverage: unlocks slot-offer texts,
  reminders, phone-code logins, promo blasts.
- Sales-tax rate on P&L; real recurring bills on Expenses.
- GOOGLE_REVIEW_URL, GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID, move email
  domain + RESEND_FROM, live Stripe keys + webhook secret, legal review of
  consent copy, FOLLOWUPS_AUTOSEND=true.

## How to work
- Web: `npx next dev -p 3002`; deploy = push main (Vercel). Verify money to
  the penny; verify UI by clicking it in Chrome.
- DB: SQL via the Management API (memory reference_lumenati_supabase_db).
- Commit style: what shipped + how it was verified; push when green.
