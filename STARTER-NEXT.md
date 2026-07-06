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

1. **Rebook prompt at the paid moment.** On the app's paid/done screen (after
   the blast), one button: "Book their next session" — client pre-filled, date
   picker up. The client is standing there glowing; that's when the ask lands.
   Wire: TapToPayPos done state needs the client (payments row has client_id
   when charged from a booking; for walk-ins offer client pick/create). The
   coach's rebooking read (lib/coach.ts practiceInsights) becomes the nag; this
   is the mechanic. Biggest earnings lever in the product.
2. **Per-artist booking QR cards.** Every artist has a public page (/slug).
   QR that deep-links to it: print-ready card (web) + save-to-photos (app).
   An afternoon, outsized charm.
3. **Client memory.** The artist's people: work done on them (healed shots
   exist), placement/style notes, "6 months since Sarah's half-sleeve" nudges.
   App screen + notes column; keep it their own clients only (RLS).
4. **Week-in-review push.** Sunday evening: "Your week: $X, N clients, M
   rebooked, best day Friday." All computed already (lib/personal.ts /
   coach.ts); needs a scheduled job (follow-up engine pattern) + push
   (lib/push/send.ts exists, pushEvent).
5. **Portfolio autopilot = client aftercare timeline.** Tokenized client link:
   their tattoo, day-by-day care, healed-photo ask at day 14 (auto-collects
   into Healed shots), rebook nudge. Follow-up engine already schedules these;
   this is the pretty surface that feeds their IG.

Then (old roadmap, still greenlit): waitlist + no-show defense; review
velocity on Reports; Instagram Graph API (only when Scott says go); SaaS
"add your shop" wizard.

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
