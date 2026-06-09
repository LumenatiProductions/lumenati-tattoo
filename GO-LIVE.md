# Go-live checklist

Everything is built, deployed, and the database is migrated. What's left is
flipping on external services, in this order. Each phase is independent and
delivers something usable on its own — you don't have to do them all at once, and
nothing here is irreversible until the Cutover (Phase 8).

**Where settings go:**
- **Web** (the admin + APIs, on Vercel): Vercel → Project → Settings →
  Environment Variables. Add the var, then **redeploy** for it to take effect.
  Mirror into your local `.env.local` for `npm run dev`.
- **App** (Expo): `app-native/.env` for local, EAS secrets for builds.

Already set (the web works today): `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SQUARE_ACCESS_TOKEN`, `CRON_SECRET`. Don't touch
those.

---

## Status — 2026-06-07

**Every starter is BUILT.** What's left is external activation (the phases below),
plus a couple of optional, not-yet-built backlog items.

| Starter | Built | Live | Waiting on |
|---|---|---|---|
| Command center (Clients · Compliance · Inventory · Bookings · Intake · Follow-ups · Reports) | ✅ | ✅ | — |
| POS-1 Payments | ✅ | ✅ **test mode** | live keys (Phase 2) |
| POS-2 Kiosk check-in | ✅ | 🟡 token set | iPad provisioning only (Phase 6) |
| POS-3 Role homes | ✅ | ✅ | — |
| POS-4 Cockpit + automation | ✅ | ✅ | brief needs `RESEND_API_KEY`; no-show forfeit opt-in; push needs EAS |
| POS-5 Connect auto-payouts | ✅ | ⬜ | enable Connect + onboard artists (Phase 3) |
| POS-6 The App (6a–6e) | ✅ | ✅ web · ⬜ phones | EAS `projectId` + dev build; Tap to Pay enrollment (Phase 7) |
| POS-7 Owned books | ✅ | ✅ | Stripe ledger now populates (keys are set) |

**Go-live phases:** 0 ✅ · 1 ✅ (test mode) · 2–8 ⬜ (below).

**New schemas to paste (2026-06-09 quality pass — 2 minutes in the SQL editor):**
- [ ] `supabase/cash-schema.sql` — turns on the real Cash Log (the page shows a
  setup hint until applied; logging + reconcile persist after).
- [ ] `supabase/settlements-schema.sql` — makes Payouts "Mark settled" stick
  (records the hand-off and resets that artist's statement).

**Not built yet (optional backlog — when you want them):**
- **Stripe Issuing** — give artists their own shop card funded by their balance.
- **Live IG analytics + running paid ads** — we have ad/post *suggestions*, not spend.
- **Deep edit** — a couple of records are create + delete in the app; full in-place
  editing still lives on the web admin.

### Resume prompt — paste this to keep knocking it out
> Continue the Lumenati go-live from `GO-LIVE.md`. Stripe Phase 1 (test mode) is
> done and verified end to end. Pick up at the next phase: do everything you can
> without me, and tell me exactly which keys/accounts you need for the rest. Go
> easiest-first — AI key (Phase 4), kiosk token (Phase 6), then Connect (Phase 3),
> live Stripe (Phase 2), the app/EAS (Phase 7), cutover (Phase 8).

---

## Phase 0 — Plumbing ✅ DONE

- [x] `NEXT_PUBLIC_SITE_URL=https://lumenati-tattoo.vercel.app` set on Vercel (Production).

---

## Phase 1 — Payments in TEST mode (the safe first win)

Unlocks: deposit + ticket pay links, the kiosk's deposit step. No real money.

- [ ] Create a Stripe account (or use the existing one).
- [ ] Stripe → Developers → API keys → copy the **test** keys:
      - `STRIPE_SECRET_KEY=sk_test_…`
      - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`
- [ ] Stripe → Developers → Webhooks → Add endpoint:
      `https://lumenati-tattoo.vercel.app/api/stripe/webhook`, events:
      `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
      `payment_intent.succeeded`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET=whsec_…`.
- [ ] Redeploy.
- [ ] **Verify:** in the admin, generate a pay link for a booking (or hit
      `/api/payments`), open it, pay with test card `4242 4242 4242 4242` (any
      future expiry / any CVC). The payment should settle and the booking deposit
      flip to "held."

> Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
> prints a `whsec_…` for your `.env.local`.

---

## Phase 2 — Payments LIVE

Unlocks: real charges. Do only after Phase 1 works.

- [ ] Complete Stripe business verification (Stripe prompts you).
- [ ] Swap the test keys for **live** keys (`sk_live_…`, `pk_live_…`) and add a
      **live** webhook endpoint (same URL/events) → new `STRIPE_WEBHOOK_SECRET`.
- [ ] Redeploy. Run one small real charge and refund it to confirm.

---

## Phase 3 — Auto-payouts (Stripe Connect)

Unlocks: card tickets auto-split to artists; instant "cash out"; Stripe files 1099s.

- [x] Connect **enabled** (sandbox). No "Express option" to pick in the dashboard —
      the app creates Express accounts in code (`lib/stripe/connect.ts` → `type:"express"`);
      enabling Connect is all that's needed. (Live Connect still gated behind Stripe go-live.)
- [ ] **BLOCKED on Scott:** full artist list + per-artist splits not finalized yet.
      Once ready → admin → **Payouts** → "Artist payouts · Stripe Connect": send each
      artist their onboarding link. They complete Stripe's KYC once. (Splits set in admin, editable anytime.)
- [ ] **Verify:** a card ticket for an onboarded artist shows the shop's cut as a
      fee and the rest transferred. For instant cash-out, the artist needs an
      eligible **debit card** on their Stripe account.

---

## Phase 4 — AI snap features

Unlocks: snap-a-receipt (app) and snap-to-count inventory.

- [x] Got Anthropic API key → `ANTHROPIC_API_KEY` set on Vercel Production + redeployed.
      **Verified live:** `/api/vision` flipped from 503 (no key) to 401 (key present,
      needs sign-in) — the config gate is satisfied.
- [ ] **Final check (in-app):** Deductions → "Snap a receipt" fills the form from a photo.

> Pluggable: to switch to Gemini Flash later, add `GEMINI_API_KEY` and implement
> the swap point in `lib/vision/provider.ts` — nothing else changes.

---

## Phase 5 — Emails (reminders, brief, alerts)

Unlocks: the morning brief, compliance expiry alerts, follow-up sends.

- [x] `RESEND_API_KEY` + `DIGEST_RECIPIENTS` set on Vercel. **Verified:** Scott received
      the morning brief (2026-06-07). Brief + alerts are live.
- [ ] **Before emailing real clients** (follow-ups): verify a sending **domain** in
      Resend and switch the `from:` off `onboarding@resend.dev`. Sending client
      mail from the test sender risks deliverability/spam flags.

---

## Phase 6 — The check-in kiosk

Unlocks: clients sign themselves in on a locked iPad.

- [x] Set `KIOSK_DEVICE_TOKEN` (Vercel Production) + redeployed. **Verified live:**
      `/api/kiosk` returns 401 without the token and 200 with it (was 503/inert before).
      Token value is in Vercel env (`vercel env pull` to retrieve) and was handed to
      Scott in chat — enter it on the iPad once.
- [ ] On the iPad, open `https://lumenati-tattoo.vercel.app/kiosk`, enter that code once.
- [ ] **Go fullscreen (no URL bar):** Share → **Add to Home Screen**, then open the
      Lumenati icon. Plain Safari keeps its URL bar; the home-screen launch is chromeless
      (the `appleWebApp` meta is already in place). Customers land on the Y2K welcome screen.
- [ ] Lock it: Settings → Accessibility → Guided Access (triple-click to pin), or
      MDM Single App Mode for several iPads.

---

## Phase 7 — The app on phones (iOS + Android)

Unlocks: Tap to Pay, push reminders, installable app. Web already works in any browser.

- [ ] `app-native/.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
      (same as web), `EXPO_PUBLIC_API_URL=https://lumenati-tattoo.vercel.app`.
- [ ] Supabase → Authentication → Email Templates: ensure the OTP/magic-link
      template includes `{{ .Token }}` so the app's 6-digit sign-in code arrives.
- [ ] Install EAS CLI (`npm i -g eas-cli`), `eas init` in `app-native/` (writes the
      `projectId` — this is what makes **push** work), then `eas build --profile
      development` for a dev client on your devices.
- [ ] **Tap to Pay** (the only deeper step): follow the 4 steps in
      `POS-STARTER-6-THE-APP.md` → 6c — install `@stripe/stripe-terminal-react-native`,
      add its config plugin + the Apple Tap to Pay entitlement, enroll in Apple/Google
      Tap to Pay. Needs Phase 3 (Connect) live for the split.
- [ ] **Push:** add your APNs key (Apple) / FCM (Google) to EAS credentials. Once the
      `projectId` exists, devices register on sign-in and the daily job nudges owners.
- [ ] Distribute via TestFlight / internal track when ready.

---

## Phase 8 — Cutover (retire Square + QuickBooks)

Run last, when the above is proven. Full runbook + rollback in **`CUTOVER.md`**.

- [ ] Retire QuickBooks first: log expenses in **Expenses & Books** for a period
      alongside QBO, export the CSVs, get your accountant's sign-off, then stop QBO entry.
- [ ] Retire Square after payments are live: run both a week, reconcile the Stripe
      ledger against the bank, pick a stop date, switch fully to Stripe, pull the
      final Square report, close the account.

---

## Fastest path to "feel it working"

Phases **0 → 1 → 4** (plumbing, Stripe test keys, AI key) light up payments and the
snap features in test mode in under an hour, no business verification, no app build.
Everything else can follow at your pace.
