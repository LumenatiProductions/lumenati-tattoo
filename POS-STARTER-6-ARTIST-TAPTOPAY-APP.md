# POS Starter 6: Artist phone app, Tap to Pay

Read `POS-BUILD-PLAN.md` first. Depends on Session 1 (payments) and Session 5
(Connect split). This is the only session that is NOT in this Next.js repo: Tap to
Pay needs a native build, so it is a separate Expo/React Native app.

## The idea in one line

An artist taps the client's card on their own iPhone to take payment in person,
and that payment runs through the same Connect split, so the artist's share lands
in their bank with no Square reader and no front-desk reconciliation.

## Why it is a separate app

Tap to Pay on iPhone (and Tap to Pay on Android) is a native SDK with an Apple
entitlement; it cannot run in mobile web. It uses
`@stripe/stripe-terminal-react-native` in an Expo dev build (not Expo Go). The app
talks to THIS repo's API over HTTPS; it does not import this codebase.

## What it reuses (server-side, already built or in Session 5)

A `ConnectionToken` endpoint and the destination-charge PaymentIntent from Session
5. The app collects the card via Tap to Pay and confirms that PaymentIntent. All
split/fee logic stays server-side and shared; the app is a thin card-collection +
today's-work client.

## Owned files (new repo / `/mobile` workspace)

Expo app: today's bookings list, "take payment" (Tap to Pay), mark complete. In
THIS repo, only a small additive `app/api/terminal/connection-token/route.ts` and
a PaymentIntent-for-terminal helper (does not touch Session 1's web flow).

## Page sketch (app)

Sign in (artist) -> today's appointments -> a booking -> "Take payment $X" ->
Tap to Pay sheet -> success -> mark complete. Minimal; the heavy management stays
on the web admin.

## Phases

1. Expo app skeleton + auth against our Supabase + today's bookings list.
2. `@stripe/stripe-terminal-react-native` Tap to Pay collecting a test payment.
3. Wire the payment to Session 5's destination-charge PaymentIntent (real split).
4. Mark-complete + receipt; Android Tap to Pay parity.

## External needs from Scott

An Apple Developer account, Apple Tap to Pay merchant enrollment, and a decision on
distribution (TestFlight / internal). Artists must have completed Session 5 Connect
onboarding for splits to work.

## STATUS

Not started. Heaviest lift; do after the web flow (Sessions 1 to 5) is proven so
the app is a thin client over a settled API.
