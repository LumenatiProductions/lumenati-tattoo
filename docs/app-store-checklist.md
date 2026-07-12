# App Store checklist — Lumenati (com.lumenati.app)

Deep-pass lane 4, 2026-07-11. Everything between TestFlight and a real listing,
sorted by who's blocked: shipped in code, waiting on Scott (Apple/Supabase
portals), or waiting on Apple.

## Done in code (rides the next build — build 21 needs Scott's go)

- **Account deletion (Apple 5.1.1(v), required).** "Delete my account" at the
  bottom of the app's Home screen, double-confirmed, calls `DELETE /api/account`
  (Bearer-authed, deletes the caller's own login + auth user). Guardrail: a
  shop's only admin can't delete themselves — the app tells them to hand the
  keys over first. Shop business records (bookings, sales) stay, by design and
  as disclosed in the privacy policy.
- **Privacy policy page.** `/privacy` on the website — plain-English, accurate
  to what we actually collect (no analytics SDKs, no ads, no tracking; Stripe
  handles cards; Supabase holds data). Linked from the app's sign-in screen.
  Deploys with the next web push.
- **Permission strings.** Bluetooth + Local Network strings added to app.json
  (Stripe card-reader support); the generic microphone string is GONE — the app
  never records audio, so the mic permission is now blocked on Android and
  stripped from iOS (image-picker `microphonePermission: false`).
- **Schema/UI groundwork.** game_id fully retired from app + web code (column
  drop queued in `supabase/2026-07-11-drop-game-id.sql` — run only AFTER build
  21 is live; older builds probe that column to show the video editor).

## Blocked on Scott (portal things — each is a few minutes)

1. **App Privacy questionnaire** (App Store Connect -> App Privacy). What to
   declare, all "linked to identity", none "used for tracking":
   - Contact info: name, email, phone (account).
   - User content: photos (portfolio/healed/receipts), customer records
     (bookings, notes).
   - Identifiers: user ID (Supabase auth id).
   - Purchases: payment history (Stripe, amounts only — no card numbers).
   - Location: coarse/fine while using (Tap to Pay requirement, Stripe).
   - NOTHING under tracking, analytics, or advertising — we ship no such SDKs.
2. **Privacy policy URL** in the listing: `https://lumenati-tattoo.vercel.app/privacy`
   (swap to the real domain when it exists).
3. **Reviewer demo account — DONE 2026-07-11.** The sandboxed "Apple Review
   Studio" shop + reviewer login are live, and the test OTP is configured
   (valid through 2026-12-31; no SMS is ever sent). Proven end to end: the
   fixed code signs in and sees only demo data.
   - App Review notes say: "Sign in with phone +1 500 555 0100, code
     000000. This is a sandboxed demo studio."
4. **Tap to Pay demo recording** — see the one-take script below.
5. **Build 21 to TestFlight** — explicit go only. `app-native/.env` already
   points at prod.

## Blocked on Apple

- **Tap to Pay production entitlement.** Currently granted dev-restricted; the
  production request needs the screen recording (below). Until Apple lifts it,
  production builds intentionally ship WITHOUT the entitlement and the app
  hides Tap to Pay (`EXPO_PUBLIC_TTP` unset in production) — the store build
  degrades cleanly, so the listing does not have to wait for this.
- **App Review itself.** Payments here are for physical services (tattoo
  sessions) and physical goods (merch) — Stripe is compliant, no IAP required.
  Put that in the review notes verbatim: "All payments in this app are for
  in-person physical services and physical goods sold by tattoo studios,
  processed via Stripe Tap to Pay. Per guideline 3.1.5(a) these do not use
  in-app purchase."

## The Tap to Pay recording — one-take script for Scott

Apple wants a screen recording of the real payment flow for the production
entitlement request. Everything is staged; the take is about 60 seconds.

Prep (once, before the take):
1. You need the DEVELOPMENT build — Apple's restricted grant only signs the
   entitlement into true development builds (a standalone/ad-hoc attempt
   failed at signing on 2026-07-12, confirming this). Stored EAS credentials
   cover it, no Apple login needed:
       cd app-native && npx eas build --profile development --platform ios
   Install from the QR when it finishes. This build loads the app from the
   Metro dev server, so have Claude make sure Metro is up and reachable from
   the phone before the take (same wifi, or a tunnel).
2. Make sure you're signed in as yourself and the shop has at least one
   booking or merch item to charge against. Stripe TEST keys are fine —
   the tap screen is identical and no real money moves.

The take:
1. Swipe into Control Center, start Screen Recording, swipe back.
2. Open Lumenati, go to the point-of-sale screen.
3. Start a charge (a merch item or a booking checkout — either is fine).
4. When the "hold card here" Tap to Pay sheet appears, tap your own card or
   Apple Pay phone against the top of the iPhone.
5. Let the done screen show, wait two seconds, stop the recording.

Then AirDrop the video to your Mac and upload it in the Apple entitlement
request form. No editing needed — Apple wants to see the raw flow.

## Standing config facts (for whoever files the forms)

- Bundle id `com.lumenati.app`, ASC App ID 6778961840, team GBUTL2R6R6.
- EAS: production profile auto-increments the build number (remote source).
- `ITSAppUsesNonExemptEncryption` already false — no export-compliance prompt.
- No Android submit config yet (Play internal testing is wired separately).
