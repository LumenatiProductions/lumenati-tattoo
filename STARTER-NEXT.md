# Lumenati — next-session starter

Read this first in a fresh context. Scott is NOT a coder: explain in plain
English, no jargon/file paths in chat. Never use emojis or em dashes.

## What this is
A tattoo-shop management product Lumenati owns end to end, replacing Square
(POS) and QuickBooks (books) — and eventually a SaaS for every tattoo shop.
Two surfaces, ROLE-BASED (Admin + Artist, nothing else):
- **Web Command Center** (`/admin`, Next.js, dev on :3002) = admins. Heavy admin.
- **Phone app** (`app-native`, Expo) = artists (phone-only) + admin on the go.
Public site is the Y2K marketing/booking layer. Owner login: lumenati@icloud.com.
Money model: cash + Stripe only, everything through the append-only **ledger**.
Logins are phone-first (text a code), email fallback; Team page manages both.

## NEXT SESSION — "make it an artist's FAVORITE app" (Scott greenlit all 5,
2026-07-06). The pattern: it makes me money, makes me look good, remembers
what I forget. Build in this order:

1. **Rebook prompt at the paid moment — SHIPPED 2026-07-06, e2e verified.**
   "Book their next session" now sits on BOTH paid moments: the Tap to Pay done
   screen (artist tickets) and the Cash log right after a positive artist
   entry. Client pre-fills from the artist's booking today (checked-in wins),
   recent-client chips otherwise, "Someone new" quick-creates name+phone; date
   defaults four weeks out; the double-booking guard blocks a taken slot. Two
   new RLS policies let artists insert their own bookings + their own walk-in
   clients (supabase/2026-07-06-artist-rebook-write.sql, applied live) — this
   also un-broke the artist home's New booking form, which had no insert
   permission and an empty roster before. Found + fixed on the way: the app
   wrote booking times as bare local strings that Postgres read as UTC (hours
   off, clash guard blind) — all app booking writes now store real instants
   like the web admin. Verified in Chrome via the app's web bundle (Metro now
   builds for web: @opentelemetry/api dep + a web stub for the Stripe Terminal
   SDK in metro.config.js). Not yet seen on-device: the TTP done screen itself
   (needs a real build; same component as the cash one).
2. **Per-artist booking QR cards — SHIPPED 2026-07-06, QR decode-verified.**
   Web: print-ready 4x6 card at /admin/card/<slug> (no shell, @page-pinned;
   "QR card" link on each Artists & Pay card) — eye logo, BOOK WITH name,
   accent handle, white QR tile, URL fallback. App: "Booking card" screen in
   My business (artist role + owner preview) — same card, Save or share
   (share sheet exports a 1080px PNG with baked quiet zone; Save Image lands
   it in Photos) + Copy link. Pure-JS QR (react-native-qrcode-svg on the
   already-shipped react-native-svg), so it works on the CURRENT TestFlight
   build via OTA — no new native modules. Both QRs decode to the artist's
   /slug (checked with macOS Vision). Not yet done on real paper: one test
   print of the 4x6.
3. **Client memory — SHIPPED 2026-07-06, data path verified.** App "My
   clients" screen (My business): the artist's people from their bookings
   (RLS-scoped), "Been a while" rail up top (no upcoming booking + 90 days
   quiet → "7 months since the half-sleeve"), each row shows sessions/last
   date/healed-shot count/upcoming badge. Tap → sheet: contact line, PRIVATE
   per-artist notes (new artist_client_notes table, (artist,client) PK, so
   two artists sharing a client never collide and desk CRM notes stay
   separate; staff can read), session history, and the RebookCard pinned to
   that client with their last service pre-filled (new clientId/serviceHint
   props). Verified via artist JWT: scoped reads, note round-trip, cross-
   artist note write denied, anon read empty. OWED: Chrome MCP died mid-
   session — one visual click-through of BOTH /promos and /my-clients
   (create promo, copy caption, end it; open client sheet, save note,
   rebook from sheet).
4. **Week-in-review push — SHIPPED 2026-07-06, penny-verified vs ledger.**
   New cron /api/ops/weekly (Mon 01:00 UTC = Sunday evening Denver;
   CRON_SECRET-gated, same fan-out shape as ops/daily — next weekly job just
   joins the list). lib/automation/week-review.ts composes per active
   artist: "Your week: $340 · 2 tickets · best day Sunday" ($ from sales,
   clients from the week's bookings with tickets fallback, rebooked =
   future bookings CREATED this week, best day named in Denver time).
   Quiet weeks send NOTHING (no $0 Sunday-night push). QA levers on the
   route: ?at=<ISO> replays any instant, ?dry=1 composes without sending —
   replay caught + fixed a missing upper time bound. JD's real last-week
   line reproduced exactly (2 tickets, $340.00, best day Sunday, verified
   by SQL). Delivery unobserved until an ARTIST login registers a push
   token (device_tokens holds only owner devices today).
5. **Aftercare timeline — SHIPPED 2026-07-06, verified in Chrome.** Public
   /care/<aftercare-followup-uuid> (same capability pattern as /healed;
   /api/care validates, 60-day window): clean parent-brand shell, "Marco,
   your new tattoo · script forearm · by <artist> · June 22", Day-N status
   pill, six-stage day-by-day timeline (Fresh / Settling in / The itch /
   Peeling / Show it off / Healed) with past ✓, TODAY highlighted in the
   artist's accent, the day-14 stage carrying the client's REAL healed-photo
   upload button (sibling followup token; locked till ~day 12), and "Book
   with <artist>" closing to their /slug. Aftercare email now carries the
   link ({{care_link}} token + gel button; SMS line included) — templates
   have no DB overrides so the new default is live. All five artist-favorite
   items are DONE, plus promos.

SHIPPED OFF-LIST (Scott asked 2026-07-06): **artist-run promos.** App
"Promos" screen (My business): artist writes the deal ("Flash Friday: 20%
off flash all weekend"), picks % + how long (weekend/1w/2w/1m/open), goes
live instantly as a pink-bordered banner on their public /slug page (the
page the QR cards open); Copy caption for stories/DMs; End it kills the
banner. artist_campaigns table + RLS (public reads ACTIVE only; artist
writes own; staff everything) applied live + in repo SQL. Verified: RLS
allow/deny via artist JWT, banner appears/disappears server-rendered.
NOT yet verified: the /promos screen clicked in a browser (Chrome MCP
dropped mid-session — one pass through create/copy/end in UI is owed).
Deliberately NOT built: text blasts to clients — Twilio trial + consent
copy gate outbound marketing; wire it through the follow-up engine once
Scott upgrades Twilio.

**Waitlist + no-show defense — SHIPPED 2026-07-07, clicked e2e in Chrome.**
New `waitlist` table (RLS: staff all; artist = own lane + the "anyone"
pool; anon nothing — allow/deny proven via artist JWT). App /waitlist
screen (Launcher, all roles): add name/phone/want/lane, per-row pills
Book them / Text them / Remove. Text them opens the PHONE's own composer
(sms: link, slot-aware message) — works today, no Twilio. The defense
moment: cancel or no-show a booking on /bookings (row pills or the edit
sheet) → green card "Tue, Jul 7 at 5:00 PM just opened up — 2 people are
on the waitlist" → Fill it → /waitlist?slot=… banner, Book them pre-loads
the freed date/time, creates the client if new, clash-guards, books, and
retires the entry with booked_id linking to the booking. Verified in DB:
entry inactive + linked, booking at the exact freed instant. NOTE: status
changes stay desk-only (artists have no bookings UPDATE policy — same as
before), so the cancel-moment card is a staff surface; artists still run
their own waitlist lane.

**Slot offers: first tap takes it — SHIPPED 2026-07-07 (Scott's call).**
On top of the manual waitlist fill: the freed-slot card's primary is now
"Text the list — first tap gets it" (POST /api/waitlist/offer; staff any
artist, artist self only). Every waiting person with a phone gets a text
with a personal claim link (/claim/<offer-uuid>/<entry>); the public page
shows Grab this spot -> "It's yours, Wanda" and books for REAL (client
created if new, clash-guarded, entry retired with booked_id); everyone
slower gets "Ooh — you just missed it" and STAYS listed. The race is one
atomic UPDATE WHERE status='open' — fired two simultaneous claims, exactly
one winner, DB verified. slot_offers table + RLS in repo + live. Twilio
TRIAL means real texts only reach verified numbers until Scott upgrades —
the API says so honestly (texted 0 + Twilio's own message surfaced in the
app note) and manual Fill it stays one pill away.

Then (old roadmap, still greenlit): review velocity on Reports; Instagram
Graph API (only when Scott says go); texting promos/waitlist through
Twilio once upgraded; SaaS "add your shop" wizard.

## Current state (compressed — it all works, verified)
- **Merch at the POS — SHIPPED 2026-07-05, penny-verified.** Priced inventory
  items are quick-tap products on both registers (app Take payment "Shop" +
  web Cash Log). Server prices carts from the DB, tax adds on top, ledger gets
  sale (net) + tax rows, stock decrements with a log line. Card path rides
  payments.tax_cents + items; webhook settles. 100% shop revenue, no split.
  Still needed: real products + prices (Inventory page), tax rate (still 0),
  live Stripe keys, one real card tap on a phone.
- **Coach v2 (2026-07-06):** practice reads lead — rebooking rate, open days
  priced at their daily average, best-week chase, strongest weekday, tip rate
  (lib/coach.ts practiceInsights, deterministic, volume-gated so they only
  fire when honest); tax truths follow. Sheets/forms got vertical air.
- **Design language (2026-07-05, Scott's pick): Money Glow + Liquid Ink** on
  BOTH surfaces. Blue-violet ink blacks, fixed ink-wash bleed (app: InkWash
  component; web: .admin-wash in admin.css), translucent glass panels lit from
  the top edge. Pink = money actions ONLY (charge/pay/log cash/mark paid);
  selection states are white lifts; earnings/up = green; numbers are heroes
  (tabular, big, count-up). Y2K stays on the public site + Y2kPaidFX. Web
  admin fully converted from light to dark (utility sweep + token flip —
  --color-ink/paper in admin.css now mean text/ground in the DARK world; never
  use bg-ink as a solid). Verified in Chrome (overview/cash/pnl/bookings/
  reports) + app home in sim. True frosted blur = expo-blur, next build.
- **Money layer complete** (2026-07-04/05): P&L by month/quarter/year back to
  2021 (penny-verified vs ledger, $702k/2,364 sales), profit chart, recurring
  bills that post when due, owner draws, sales tax capture (rate on shop, tax
  ledger rows, remittance figure), P&L + general-ledger CSV exports, rent
  mark-paid (cash/check — not yet live-tested), ticket-refund UI, categorized
  nav (Front of house / Finances / Shop / Admin) on web + app.
- **Roles + logins** (2026-07-05): Admin + Artist only (stored admin value is
  'owner' internally — policies untouched). Phone-first sign-in on web + app;
  /api/staff pre-creates logins with email AND phone confirmed so either code
  works; Team page manages it. E2E verified.
- **Artist app** (2026-07-05): Robinhood home — Take payment + New booking up
  top (booking form opens in one tap), "Your day" next-client card, scrubbable
  earnings chart (haptic detents), tappable week bars, rewards, coach, taxes.
  **Healed shots** screen: client healed photos → one tap → share sheet with
  auto-caption on clipboard (IG on real phones). All verified in sim.
- **Roster is self-serve**: Artists & Pay adds artists; "Square history not
  linked to anyone" panel moves an old Square login's entire history onto an
  artist in one click (Grey Barrix is sitting there; Stephanie Moore is the
  BOOKKEEPER — leave her unlinked). Ledger append-only for money; only
  attribution (artist_id) is correctable.
- **Historicals staged** (not cut over): 2,378 Square sales back to 2021 in
  sales + ledger; JD's ~668 attributed; guests left as shop revenue. Client
  de-dupe deferred (~9 pairs, merge API exists).
- A TestFlight build with EVERYTHING (phone sign-in, artist home, healed
  shots — includes new native modules) was submitted 2026-07-05.

## Scott's external checklist (gates launch — docs/owner-setup-checklist.md)
- Twilio TRIAL upgrade (texts only reach verified numbers until then — this
  also gates phone-login codes for the team).
- Set the sales-tax rate on the P&L page + confirm what's taxable in-state.
- Enter real recurring bills (lease, utilities, software) on Expenses.
- GOOGLE_REVIEW_URL, move email domain + RESEND_FROM, live Stripe keys +
  webhook secret, legal review of consent copy, FOLLOWUPS_AUTOSEND=true.

## How to work
- Web dev: `cd ~/lumenati-tattoo && npm run dev` (:3002). Deploy = push main
  (Vercel). Verify money to the penny; verify UI in Chrome (localhost:3002).
- Mobile: EAS `eas build -p ios --profile production --auto-submit` works
  non-interactively — but NEVER start a build without Scott's explicit go
  (free-plan build credits). The merch + design + coach app changes are NOT
  on TestFlight yet; they ship with the next approved build (add expo-blur
  for real frosted glass when that happens). Local sim: `npx expo prebuild -p ios --clean` then
  `npx expo run:ios` (the untracked ios/ dir goes stale when plugins change —
  prebuild fixes the ExpoCalendar plist crash). Reuse the running Metro.
- Sim driving: synthetic CGEvent taps/drags DO work but move Scott's real
  cursor — only when he's away and says "click away". Wheel events do nothing;
  scroll with drags. Coords = AXGroup origin + framebuffer × (ax/fb) scale.
- DB: SQL via Supabase Management API, project ref humjddiwzzanvvqztypy (see
  memory `reference_lumenati_supabase_db`; PAT expires 2026-07-31). ALWAYS
  `notify pgrst, 'reload schema'` after DDL or reads fall back to mock.
