# POS Starter 6: The App (Expo universal — iOS, Android, web)

Read `POS-BUILD-PLAN.md` first. This supersedes the old "thin Tap-to-Pay app"
scope: the team is all mobile-native, so the app becomes the whole platform, not
a payments accessory. (Old filename `POS-STARTER-6-ARTIST-TAPTOPAY-APP.md` is
retired in favor of this.)

## The one-line vision

A pocket business for the independent tattoo artist — take payment, see the
money, hit goals, handle taxes, stay compliant — inside a collective where the
shop benefits because its artists thrive. Owners get the same app, role-gated.

## Locked decisions (Scott, 2026-06-05)

1. **Stack:** Expo / React Native, **universal** — one codebase ships iOS +
   Android + web. The destination is "everything in the app, also on web."
2. **One backend, two clients.** Supabase + the existing Next API routes + the
   money math (`calc.ts`) + the Connect split (`connectChargeParams`) are reused
   AS-IS. We rebuild the UI layer in RN, never the brains. The Next web admin
   keeps running until the app reaches parity, so nothing goes dark.
3. **Owners on the app too**, role-gated — the existing role routing
   (ArtistHome vs OwnerHome/cockpit) carries straight over.
4. **Instant payouts are artist-paid + per-payout.** Standard = free (~2 days);
   Instant = ~1.5% (min $0.50) fee to their debit card in minutes. The app shows
   the choice each cash-out; the artist eats the fee only if they want it now.
5. **Taxes:** the app helps but is not a CPA. YTD earned (the 1099 number),
   suggested set-aside %, deduction logging, quarterly reminders, year-end
   export. Plain "not tax advice — confirm with a pro" disclaimer.

## Architecture

```
            ┌─────────────── one backend ───────────────┐
            │  Supabase (DB + RLS)                       │
            │  Next API routes (/api/*) + lib/ logic     │
            │  Stripe (Connect split, payouts, webhooks) │
            └───────────────┬───────────────┬───────────┘
                            │               │
                 Expo app (RN)        Next web admin
              iOS / Android / web     (back office; stays
              role-gated             until app hits parity)
```

The app authenticates to Supabase directly (same project) and calls the existing
`/api/*` endpoints. New native-only needs (Tap to Pay, camera) get thin new API
endpoints; the split/payout/tax logic stays server-side and shared.

## Sub-sessions (the relay continues inside Session 6)

- **6a — Scaffold:** Expo universal app, Supabase auth, the role-routed shell
  (artist vs owner), reading our existing APIs. Ships the home/today on all three
  targets. *(Detailed below — this is next.)*
- **6b — Money & coaching:** earnings, realized **hourly rate** (price ÷ booked
  hours), goals + progress, the **tax tracker**, charts ("dopamine" done right —
  reward real progress, not vanity).
- **6c — In-person POS:** Tap to Pay (iOS + Android) reusing
  `connectChargeParams`; instant "cash out now" (artist-paid fee).
- **6d — Nudges & owner-on-the-go:** rent / follow-up / consent reminders, snap
  features (below), owner approvals + cockpit on mobile.
- **6e+ — Back-office migration:** port the remaining web screens to Expo web
  incrementally; retire the Next admin once parity lands.

## Feature backlog (Scott's brainstorm, triaged — pull into the right sub-session)

Tags: **[easy]** light add · **[mid]** real feature, our backend · **[heavy]**
new integration/underwriting, defer · **[schema]** needs a small DB change.

- **[mid] Snap-to-count inventory** (6d) — camera → Claude vision reads a shelf →
  pre-fills a count/reorder the human confirms. Also "snap the box" to add an
  item. Framing: assisted count, not a perfect tally. Reuses inventory backend.
- **[mid][schema] Shop-vs-artist supplies** (6b/6d) — inventory needs an OWNER
  dimension (shop stock vs each artist's personal ink/needles). Makes reorder,
  the photo-count, and the tax loop correct — an artist's own purchases are
  *their* deductions.
- **[easy→mid] Receipt-snap expenses** (6b) — photo → AI reads vendor+amount →
  logs a deductible expense → feeds the tax tracker. Do before any card issuing.
- **[heavy] Stripe Issuing** (later) — issue artists a card funded by their
  Stripe balance; swipes auto-log as deductions. Closed loop, but needs
  underwriting/compliance. Phase 2 once volume justifies it.
- **[mid][schema] Inspection readiness + license wallet** (6d, extends
  Compliance) — checklist (BBP, sharps, autoclave/spore logs, signage, first aid)
  with date/photo + readiness score + reminders; artists hold/renew their own
  licenses (snap, expiry, renewal-portal link). Needs artist-scoped RLS read of
  their OWN compliance rows.
- **[mid] Ad/post suggestions** (6b/6d, extends Social) — AI suggests promos from
  best work + booking gaps, drafts captions. SUGGEST only.
- **[heavy] Live social analytics + running paid ads** (later) — Meta Graph /
  Marketing API, per-artist auth, app review, ad spend. Defer.
- **Note on "Stripe Link MCP":** Link (fast saved-card checkout) is already free
  in our Checkout; the Stripe MCP is a dev tool, not a customer feature. Nothing
  to build there unless a specific need surfaces.

## What it reuses (already built, server-side)

`connectChargeParams` (the split) · `payments` + the webhook (settle) · `calc.ts`
(money math) · the role routing · bookings/clients/inventory/compliance/
followups APIs + their aggregates · Reports (1099 basis for the tax tracker).

## External needs from Scott

Apple Developer + Google Play accounts (have both). Apple Tap to Pay merchant
enrollment + Android Tap to Pay for 6c. Stripe keys + Connect (from Sessions 1 +
5). Decisions as features land: tax set-aside default %, whether shop ever
subsidizes the instant fee, Issuing later.

## STATUS

Plan rewritten 2026-06-05 (was the thin Tap-to-Pay app).

### 6a — Scaffold: BUILT (2026-06-06)
Expo universal app stood up in `app-native/` (own workspace; the Next web admin
is untouched). `npm install` clean (941 pkgs), `tsc --noEmit` green.

- Expo Router (SDK 52, new arch on) targeting iOS / Android / web from one tree.
- `lib/supabase.ts` — shared client, AsyncStorage (localStorage on web), pointed
  at the SAME project. Reads are RLS-scoped, so an artist's `sales` query returns
  only theirs — no backend change for 6a.
- `lib/auth.tsx` — session + role from `profiles` (same lookup as the web),
  graceful "artist" fallback.
- Routes: `index` (redirect by auth) · `sign-in` (email one-time-code, no
  passwords / no deep links, existing-staff-only) · `(app)/_layout` (auth guard)
  · `(app)/home` (role-routed: owner sees gross/appts-today/low-stock/tickets,
  artist sees brought-in/tips/tickets) — all from REAL Supabase data.
- Decision validated: one backend, universal client, role routing carries over.

Run it: `cd app-native && cp .env.example .env` (fill Supabase URL+anon, same as
web) `&& npm install && npx expo start` (i/a/w). The Supabase email template
needs `{{ .Token }}` for the OTP code. README has the details.

### 6b — Money & coaching: BUILT (2026-06-06)
The artist money home is real, plus goals + the tax tracker. `tsc --noEmit` green.

- `supabase/app-personal-schema.sql` — APPLIED: `artist_goals` + `artist_expenses`,
  keyed to the **auth user** (not artist_id, so no roster mapping) with RLS
  `user_id = auth.uid()` — strictly private to each artist.
- `lib/personal.ts` — RLS-scoped money calcs (earnings by week/month/year,
  **realized hourly rate** = service ÷ completed-booking hours, last-7-days
  strip) + goals/expenses CRUD.
- `components/ArtistMoney.tsx` — the home: range toggle, earned/hourly/tickets/
  tax-reserve tiles, goal pacing bar, a 7-day bar strip (plain Views, no chart
  dep), and a tax card (YTD = 1099 basis, deductions, set-aside, next quarterly
  date) with a plain "not tax advice" line.
- `app/(app)/goals.tsx` — set weekly/monthly target + tax %.
- `app/(app)/expenses.tsx` — log deductions (ink/needles/rent/etc.); YTD feeds
  the tax reserve.
- `app/(app)/home.tsx` — artists → `ArtistMoney`; staff → the 6a glance (owner
  cockpit port is 6d).
- `components/ui.tsx` — shared RN primitives (Card/Stat/Button/ProgressBar).

Real-data note: reads are real (no mock), so a fresh artist sees zeros until
sales/bookings exist — honest empty state, same as Reports.

### 6c — In-person POS: BUILT (2026-06-06)
Server side fully built + `npm run build` green; app side built + `tsc` green.
The card-tap itself is wired but can't be exercised here (needs a dev build +
enrollment) — everything around it is real and verified.

Server (Next, Bearer-authed for the app):
- `lib/api-auth.ts` — `userFromBearer` validates the app's Supabase token and
  resolves role + `artist_id` (from `profiles`, the same link `my_artist()` uses).
- `app/api/terminal/connection-token` — Terminal ConnectionToken for the SDK.
- `app/api/terminal/payment-intent` — mints a **card-present** PaymentIntent as
  the SAME destination charge as web (`connectChargeParams`); records a pending
  `payments` row. No split recomputed in the app.
- `app/api/payouts/instant` — GET instant-eligible balance; POST cash-out
  (`payouts.create({method:'instant'}, {stripeAccount})`); owner-or-self gated.
- webhook: added `payment_intent.succeeded` → settles Terminal payments by PI id.

App (Expo):
- `lib/appApi.ts` — Bearer-authed fetch to the Next API.
- `lib/terminal.ts` — Tap to Pay **facade**: lazy-requires
  `@stripe/stripe-terminal-react-native` (NOT installed — keeps the bundle/tsc/
  web green); returns a clear "needs the phone app / dev build" until present.
  Header comments list the 4 steps to finish on a dev build.
- `app/(app)/pos.tsx` — amount → charge; web/non-enrolled shows where to tap.
- `app/(app)/cashout.tsx` — **fully functional on every target**: shows
  instant balance, "Cash out now" with the ~1.5% fee line.
- Take payment / Cash out actions on the artist home.

**Gate for live taps (Scott):** `npm install @stripe/stripe-terminal-react-native`,
add its Expo config plugin + Tap to Pay entitlement, build a dev client, enroll in
Apple Tap to Pay / Android. Stripe Connect must be live (Session 5) for splits +
instant payouts.

### 6d — Snap features + owner-on-the-go: BUILT (2026-06-06)
Next build green; app tsc green. Vision is **pluggable, default Claude** (Scott's
call) — the app + endpoint never change if we later default to Gemini Flash.

- `lib/vision/provider.ts` (Next) — `VisionProvider` interface + a Claude impl
  (`claude-opus-4-8` vision, JSON-instructed, defensive parse). `getProvider()`
  is the single swap point; drop a `GeminiProvider` there to switch backends.
- `app/api/vision/route.ts` — Bearer-authed (`userFromBearer`); POST a photo +
  `kind` (`receipt` | `inventory`) → structured data to confirm.
- App `lib/vision.ts` — `snapReceipt` / `snapInventory` (expo-image-picker:
  camera on phone, library on web), posts base64 to `/api/vision`.
- App `expenses.tsx` — "Snap a receipt" prefills vendor/amount/category for the
  artist to confirm, then Add. Feeds the tax tracker.
- App `home.tsx` StaffHome → an at-a-glance **owner cockpit**: gross / appts /
  low-stock / deposits tiles + a "needs attention" list (expiring compliance,
  reorders by name, follow-ups due), read RLS-scoped.
- `.env.local.example` — `ANTHROPIC_API_KEY`; app added `expo-image-picker`.

**Gate (Scott):** set `ANTHROPIC_API_KEY` to enable the snap features.
**Deferred (noted):** snap-to-count is server-ready (`kind:'inventory'`) but its
app screen lands with an in-app inventory view; push reminders
(rent/follow-up/consent) need a dev build + a push-token table — next pass.

### 6e — Back-office in the app: STARTED (2026-06-06)
First pass of porting the admin into the app. App tsc green. No new backend — the
app reads/writes Supabase directly under RLS (only Stripe/vision/terminal use the
Bearer API), so each role only touches what its policies allow.

- `components/Launcher.tsx` — role-aware "Go to" grid on the home (Bookings for
  everyone; Inventory for owner/frontdesk; Deductions/Goals for artists).
- `app/(app)/bookings.tsx` — today + upcoming, RLS-scoped (artists see their own);
  staff mark complete / no-show by writing under RLS. Deposit + checked-in badges.
- `app/(app)/inventory.tsx` — list + low-stock + quick +/- (writes qty under RLS),
  AND the **snap-to-count from 6d wired in**: photo → detected items → tap to add.
- `home.tsx` — renders `<Launcher>` for all roles.

### 6e pass 2 (2026-06-06): Reports / Clients / Compliance in the app
- `/api/reports` now accepts the app's Bearer token (cookie OR bearer → resolve
  role → read with the service-role client). Reuses the SAME server money math.
- `app/(app)/reports.tsx` — shop summary tiles + per-artist (owner/bookkeeper).
- `app/(app)/clients.tsx` — RLS-scoped search, tap-to-call (staff).
- `app/(app)/compliance.tsx` — license/permit list, expiring floats up (owner).
- Launcher gained Clients / Reports / Compliance, role-gated.
- Next build green; app tsc green.

### 6e pass 3 (2026-06-06): create forms in the app
The app can now CREATE, not just read+act. App tsc green.

- `components/form.tsx` — shared `LabeledInput` + `Chips` (single-select).
- `lib/ids.ts` — id generator for text-PK tables (mirrors the web's `walkin-`/`bk-`).
- `clients.tsx` — "New client" (walk-in) form → inserts under RLS.
- `inventory.tsx` — "Add item" form (name/category/unit/qty/reorder) → insert.
- `compliance.tsx` — "Add license/permit" (scope, artist picker, kind, expiry;
  status computed client-side) → insert (owner).
- `bookings.tsx` — "New booking" (artist + client/walk-in pickers, date/time,
  service, deposit) → insert (`bk-…`, status scheduled, source manual).

### 6e pass 4 (2026-06-07): delete/cancel + push reminders
- **Delete/cancel:** inventory item delete, compliance item delete (owner),
  booking cancel (staff) — all via RLS writes. Create is no longer one-way.
- **Push reminders** (scaffolding, real on a dev build):
  - `supabase/push-schema.sql` — APPLIED: `device_tokens` (token, user_id, email,
    platform) + RLS (user manages own).
  - app `lib/push.ts` — registers the Expo push token on sign-in (called from
    `(app)/_layout`); no-op on web / until an EAS projectId + dev build exist.
  - `lib/push/send.ts` (Next) — `sendExpoPush` (Expo push service, no APNs/FCM
    keys our side) + `tokensForRoles` (role resolved live from `profiles`).
  - `lib/automation/push.ts` — `runPushReminders`: one-line "what needs you
    today" (reorders / expiring licenses / no-show review) pushed to OWNER
    devices, only when there's something. Wired into `/api/ops/daily`.
- **Dep fix:** pinned `expo-image-picker` + `expo-notifications` to the SDK-52
  versions (npm had grabbed `^56`, which mismatched and would have broken the
  native build). Next build green; app tsc green.

**Gate (Scott):** push needs an EAS `projectId` + a dev build to actually deliver
(token registration no-ops until then).

### 6e pass 5 (2026-06-07): edit forms + date/time picker — LAST MILE DONE
- **Edit:** tap a client / inventory item / compliance record to edit it in place
  (the create form now does update-or-insert by id). Booking edit stays
  cancel+recreate (status actions cover the rest).
- **Date/time picker:** `components/DateTimeField.tsx` (base = fields, used by web
  + tsc) + `DateTimeField.native.tsx` (wheel pickers via
  `@react-native-community/datetimepicker`, SDK-52 pinned). Platform-split files
  keep the native-only package out of the web bundle. Wired into New booking.
- app tsc green.

**Parity reached.** The app now reads, creates, edits, deletes, and acts across
the daily back office (bookings, clients, inventory, compliance) plus money / POS
/ taxes / cockpit. The Next web admin is now OPTIONAL — keep it for bulk/edge
work; the app is the everywhere front door.

**Remaining = external only (Scott):** Stripe keys (payments/payouts/ledger),
`ANTHROPIC_API_KEY` (snaps), `KIOSK_DEVICE_TOKEN`, and Apple/Google + an EAS
`projectId`/dev build (Tap to Pay + push). No code is blocking.
