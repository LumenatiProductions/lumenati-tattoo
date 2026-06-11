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

**New schemas from the 2026-06-09 quality pass — APPLIED ✅ (verified in SQL editor):**
- [x] `supabase/cash-schema.sql` — real Cash Log is ON (cash_entries exists, count 0).
- [x] `supabase/settlements-schema.sql` — Payouts "Mark settled" sticks (settlements exists, count 0).

**Product pass schemas (2026-06-09, later the same day) — ALL APPLIED ✅ (verified):**
- [x] `messaging-schema.sql` — reminder_48h / reminder_24h / healed_photo followup kinds
- [x] `tips-schema.sql` — payments.tip_cents
- [x] `booking-requests-schema.sql` — booking_requests table (public /request form)
- [x] `cash-sessions-schema.sql` — cash_sessions drawer table
- [x] `guardian-schema.sql` — guardian co-sign columns on consent_forms
- [x] `request-refs-schema.sql` — reference-photo bucket + column for /request (verified)

**Product pass 2 schemas (2026-06-10) — ALL APPLIED ✅ (verified):**
- [x] `healed-photos-schema.sql` — healed_photos table + bucket (upload page + Social queue)
- [x] `confirmations-schema.sql` — bookings.confirmed_at (reply-C confirmations)
- [x] `rent-invoices-schema.sql` — in-house rent invoices with pay links

**One more Twilio step when keys land:** set the Messaging Service's inbound
webhook to `https://lumenati-tattoo.vercel.app/api/sms/inbound` so reply-C
confirmations work. Optional: `ALERT_WEBHOOK_URL` (any Slack-style webhook)
turns on error alerts.

**New activation items for Scott (the only two things code can't do):**
- [ ] **Twilio** — create the account, then on Vercel set `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`).
  Texts (consent links, reminders, follow-ups) switch on instantly; email is the
  fallback until then.
- [ ] **Consent wording** — send `lib/intake/forms.ts` to the shop's attorney,
  apply any edits in place, then set `LEGAL_COPY_REVIEWED = true` (and decide on
  `MINORS_GUARDIAN_CONSENT` while you're at it; it's OFF by default).

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

## Phase 7 — The app on phones (iOS + Android) — ✅ SHIPPED 2026-06-10

Both stores live for internal testers, full pipeline automated:
- **iOS**: builds auto-submit to TestFlight (`eas build -p ios --profile production
  --auto-submit` from app-native/ — ascAppId wired, certs EAS-managed). Scott +
  crew install via TestFlight Internal Testing group "Shop Crew".
- **Android**: published to Play Internal testing. Opt-in link:
  https://play.google.com/apps/internaltest/4701288504633492438
  Store listing (name/icon/banner/screenshots) saved. Future builds: `eas build
  -p android` then upload the .aab in Play Console (or set up a service-account
  key to automate `eas submit -p android`).
- Battle scars fixed permanently: Kotlin 1.9.25 pin, Android target API 35,
  iOS image:latest (Apple's iOS-26-SDK floor), EXPO_PUBLIC env vars pushed to
  EAS (`eas env:push`), OTP email template now contains the 6-digit code.
- [x] Tap to Pay entitlement REQUESTED from Apple (2026-06-10) — when approved:
      follow POS-STARTER-6-THE-APP.md → 6c (install stripe-terminal-react-native
      + config plugin + entitlement, needs Phase 3 Connect live).
- [ ] Push credentials: `eas credentials` → create APNs key + FCM when push
      notifications matter (devices register on sign-in already).
- [ ] (Public-store only, NOT needed for internal:) privacy policy URL + content
      declarations + send-for-review to drop the "(unreviewed)" temp name.

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
