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

### Aimed at 6b (money & coaching) — next
Build the artist money home for real: earnings over a range, **realized hourly
rate** (price ÷ booked hours from `bookings.starts_at/ends_at`), goals + progress,
and the **tax tracker** (YTD = the 1099 number, suggested set-aside %, deduction
log, quarterly reminders). Charts via a RN lib (Victory/Skia). The owner cockpit
port can come alongside or in 6d. Reuse `calc.ts` shapes server-side where the
math gets real; keep simple sums client-side via RLS like 6a does.
