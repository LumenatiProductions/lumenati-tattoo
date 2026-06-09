# STARTER — read this first (resume point)

One doc to resume from in a fresh chat without re-reading history. If you (the
assistant) are starting cold: read this, then `GO-LIVE.md` for the checklist.
Keep this file updated as the single source of truth.

## Where we are (2026-06-09)

The whole platform is **BUILT and deployed**. Web admin lives at
`https://lumenati-tattoo.vercel.app` (Next 15, on Vercel, team `cinebody`). The
phone app is in `app-native/` (Expo SDK 52, universal: iOS/Android/web). All
Supabase tables + RLS are **already applied** to the live DB.

Most remaining work is **turning features on with keys/accounts — not coding.**

## Done + live
- Command center: clients, compliance, inventory, bookings, intake, follow-ups, reports
- Role-routed homes + owner cockpit + daily automation (no-show forfeit is opt-in)
- Owned books (shop expenses + Stripe ledger + accountant CSV)
- The app (6a–6e): money/goals/taxes, in-person POS, instant cashout, snap
  receipt + snap-to-count, bookings/clients/inventory/compliance with create+edit+delete
- **Payments: LIVE in Stripe TEST mode** — keys + webhook set on Vercel, verified end to end.
- **AI snaps LIVE** — `ANTHROPIC_API_KEY` set on Vercel, verified (`/api/vision` 401 with key).
- **Email/morning brief LIVE** — `RESEND_API_KEY` + `DIGEST_RECIPIENTS` set; Scott received the brief.
- **Stripe Connect ENABLED** (sandbox) — app creates Express accounts in code; live Connect still gated behind Stripe go-live.
- **Kiosk token DONE** — `KIOSK_DEVICE_TOKEN` set on Vercel + verified (`/api/kiosk` 401→200).

## Quality pass (done 2026-06-09, full command-center sweep)
Four-agent audit + fixes across every admin page, API, kiosk, intake, and pay
flow. Highlights:
- **Cash Log is real** (was 100% mock): `cash_entries` + `/api/cash` +
  `CashProvider`; owner/bookkeeper homes read live unreconciled cash.
- **Payouts "Mark settled" is real** (was a dead button): `settlements` table;
  statements compute from sales after each artist's `settled_through`; Square
  rent invoices matched by payer name now feed `rentOwed`.
- **Two new schemas need a paste** in the Supabase SQL editor (tracked in
  GO-LIVE.md): `cash-schema.sql`, `settlements-schema.sql`. Both pages degrade
  gracefully until then.
- Hardening: constant-time kiosk token compare, kiosk acts only on today's
  bookings, consent double-sign guard (409 → signed screen client-side),
  bearer-auth requires a profiles row (off-boarded staff lose app access),
  $20k amount caps, deposit-status enum validation.
- Polish: clients drawer shows real appointment history, room editor has a
  save indicator, owner-only pages gate cleanly, staff/artist removals confirm
  + surface errors, optimistic mutations self-correct on failure.

## Branding & design (done 2026-06-09, deployed)
Two identities, on purpose:
- **Console / payments / intake / app = clean Lumenati parent brand:** the
  all-seeing-eye + wordmark logo (`public/brand/lumenati-on-light.svg` = dark marks,
  `lumenati-on-dark.svg` = white marks; shared `components/brand/LumenatiLogo.tsx`),
  **Helvetica Neue**, pink (`#ff1493`) accent kept. App uses `react-native-svg`
  (`app-native/components/LumenatiLogo.tsx`, fills baked inline) + Helvetica Neue
  set globally in `app-native/app/_layout.tsx`.
- **Kiosk = FULL Y2K** (front-of-house, matches the public site): neon/CRT, Press
  Start 2P / VT323 / Share Tech Mono, scanlines, marquee, gel buttons, glowing eye.
  Has a **customer welcome/attract screen** (device-code screen is staff-only).
  `appleWebApp` meta added → **Add-to-Home-Screen launches fullscreen** (no URL bar);
  plain Safari still shows the URL bar.
- **Public Y2K site: untouched** (Scott likes it).

## Next — go-live, easiest first (track in GO-LIVE.md)
1. **Real money (Stripe live)** — Scott finishes Stripe business verification, then
   swap test keys for `sk_live_`/`pk_live_` + a live webhook. (Phase 2)
2. **Connect artist onboarding** — BLOCKED on Scott's full artist list + per-artist
   splits. Then admin → Payouts → send onboarding links. (Phase 3)
3. **App on phones** — `eas init` (writes projectId → push), dev build, Apple/Google
   Tap to Pay enrollment. (Phase 7)
4. **Cutover** — retire QuickBooks then Square. Runbook: `CUTOVER.md`. (Phase 8)

Smaller follow-ups:
- **Console local review needs Supabase redirect allowlist:** the admin magic link
  redirects to `location.origin/auth/callback`; `http://localhost:3210` isn't in
  Supabase → Auth → URL Configuration → Redirect URLs, so local sign-in bounces to
  prod. Add it to review the branded console on localhost.

## How things work here (so you don't re-discover)
- **Apply a DB schema:** paste the SQL into the Supabase SQL editor and Run (the
  project is NOT linked to the Supabase CLI). Project ref `humjddiwzzanvvqztypy`.
- **Set a Vercel env var:** `vercel env add NAME production` (CLI is authed). To
  redeploy after env changes, push an empty commit — `vercel redeploy <alias>`
  hits a team-scope error.
- **Secrets:** the assistant doesn't enter real financial credentials/API keys —
  Scott adds those (Stripe test keys were the sandbox exception). Public keys
  (`pk_…`, kiosk token) are fine for the assistant to set.
- **App talks to Supabase directly under RLS** for reads/writes; only Stripe,
  vision, and Tap to Pay go through the Next API (Bearer auth via `lib/api-auth.ts`).
- **Build checks:** `npm run build` (web), `cd app-native && npx tsc --noEmit` (app).
- Apply-then-verify schema edits return "Success. No rows returned" in the SQL editor.
- **Design harness (local, on the iMac):** `PORT=3210 npm run dev` (web), and
  `cd app-native && npx expo start --ios` for the app on the iPhone sim. For the
  kiosk-as-iPad: boot an iPad sim, `xcrun simctl openurl <udid> http://localhost:3210/kiosk`,
  rotate to landscape (Cmd+←). **Local kiosk device code is `bedroom`** (in `.env.local`,
  gitignored; prod uses the long Vercel token). Sim text entry is flaky (long-press →
  accent popup) — prefer Connect Hardware Keyboard or short input.
- Driving Chrome: connect the **"Imac"** browser (`select_browser`), not "Studio".

## Resume prompt (paste into a new chat)
> Read `STARTER.md`, then continue the Lumenati go-live. Do everything you can
> without me and tell me which keys/accounts you need. Start with the next
> unchecked item.
