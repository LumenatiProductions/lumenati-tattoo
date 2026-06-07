# STARTER — read this first (resume point)

One doc to resume from in a fresh chat without re-reading history. If you (the
assistant) are starting cold: read this, then `GO-LIVE.md` for the checklist.
Keep this file updated as the single source of truth.

## Where we are (2026-06-07)

The whole platform is **BUILT and deployed**. Web admin lives at
`https://lumenati-tattoo.vercel.app` (Next 15, on Vercel, team `cinebody`). The
phone app is in `app-native/` (Expo SDK 52, universal: iOS/Android/web). All
Supabase tables + RLS are **already applied** to the live DB.

Remaining work is **turning features on with keys/accounts — not coding.**

## Done + live
- Command center: clients, compliance, inventory, bookings, intake, follow-ups, reports
- Role-routed homes + owner cockpit + daily automation (no-show forfeit is opt-in)
- Owned books (shop expenses + Stripe ledger + accountant CSV)
- The app (6a–6e): money/goals/taxes, in-person POS, instant cashout, snap
  receipt + snap-to-count, bookings/clients/inventory/compliance with create+edit+delete
- **Payments: LIVE in Stripe TEST mode** — keys + webhook set on Vercel, verified
  with a real $1 test pay link end to end.

## Next — go-live, easiest first (track in GO-LIVE.md)
1. **AI snaps** — add `ANTHROPIC_API_KEY` on Vercel → redeploy. (Scott's key.)
2. **Connect (auto-payouts)** — enable Connect (Express) in Stripe; onboard artists
   from the admin Payouts page.
3. **Real money** — swap Stripe test keys for live keys + a live webhook.
4. **App on phones** — `app-native/.env`, `eas init` (gets the projectId → enables
   push), dev build, Apple/Google Tap to Pay enrollment.
5. **Cutover** — retire QuickBooks then Square. Runbook: `CUTOVER.md`.

**Kiosk token is DONE** — `KIOSK_DEVICE_TOKEN` set on Vercel + verified live
(`/api/kiosk`: 401 without token, 200 with). Only iPad provisioning remains: open
`/kiosk` on the iPad, enter the token (in Vercel env / handed to Scott), lock with
Guided Access.

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

## Resume prompt (paste into a new chat)
> Read `STARTER.md`, then continue the Lumenati go-live. Do everything you can
> without me and tell me which keys/accounts you need. Start with the next
> unchecked item.
