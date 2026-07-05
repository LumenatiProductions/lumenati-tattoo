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

## NEXT SESSION — the roadmap Scott aimed us at (2026-07-05)
"Make this app make tons of sense and be awesome for all tattoo shops."
Build in this order; 1 and 2 make money directly:

1. **Merch + product sales at the POS — SHIPPED 2026-07-05.**
   - `price_cents` on inventory (2026-07-05-merch-pos.sql, applied). Inventory
     page: "Sells for" column, click-to-edit + add-form field. A priced item
     IS a product; clearing the price takes it off sale.
   - Quick-tap product buttons live on BOTH registers: web Cash Log
     ("Merch — cash sale" card) and the app's Take payment screen (For=Shop
     shows the shelf; cart replaces keypad; card via Tap to Pay or a
     "Paid cash" button; fallback builds get cash-only). Server prices every
     cart from the DB (client only sends ids+qty), tax ADDS on top of shelf
     price, ledger gets sale (net) + tax rows, stock decrements w/ log row.
     Card path: payments.tax_cents + items ride the row; webhook settles tax
     row + stock. E2E verified on web to the penny (2x $25 @7.25% = $53.63,
     ledger 5000+363, stock 10→8, delete-reversal nets 0; test data cleaned,
     tax rate left at 0 for Scott). App: typechecked; card tap + app UI still
     need a real-phone pass, and the app changes ride the NEXT build/OTA.
   - Product sales are 100% shop revenue (artist_id null, no split).
2. **Fill the empty chair (waitlist + no-show defense).**
   - Waitlist: a cancellations table/flow — when a booking cancels, text the
     waitlist (Twilio wired) with a claim link; first-come fills the slot.
   - No-show defense: deposit auto-applies/forfeits when a client no-shows;
     surface a no-show risk hint on bookings (history-based).
3. **Per-artist booking QR cards.** Every artist already has a public page
   (/slug). Generate a QR (print-ready card + save-to-photos in the app) that
   deep-links to their booking page. An afternoon of work, outsized charm.
4. **Client aftercare timeline.** A tokenized client link: their tattoo, care
   instructions day by day, healed-photo ask at day 14, rebook nudge. The
   follow-up engine already schedules these; this is the pretty surface.
5. **Review velocity.** GOOGLE_REVIEW_URL powers the review follow-up (Scott
   sets it). Add "reviews requested / sent this month" to Reports.
6. **Instagram Graph API auto-posting** — real auto-post needs Meta app
   review (external, weeks). The share-sheet flow shipped 2026-07-05 covers
   most of the value; only start this when Scott says go.
7. **The SaaS onboarding** — shops seam exists on all tenant tables. When the
   above is solid: "add your shop" wizard, per-shop branding, per-shop Stripe.

## Current state (compressed — it all works, verified)
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
  non-interactively. Local sim: `npx expo prebuild -p ios --clean` then
  `npx expo run:ios` (the untracked ios/ dir goes stale when plugins change —
  prebuild fixes the ExpoCalendar plist crash). Reuse the running Metro.
- Sim driving: synthetic CGEvent taps/drags DO work but move Scott's real
  cursor — only when he's away and says "click away". Wheel events do nothing;
  scroll with drags. Coords = AXGroup origin + framebuffer × (ax/fb) scale.
- DB: SQL via Supabase Management API, project ref humjddiwzzanvvqztypy (see
  memory `reference_lumenati_supabase_db`; PAT expires 2026-07-31). ALWAYS
  `notify pgrst, 'reload schema'` after DDL or reads fall back to mock.
