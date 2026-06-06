# Build Plan: own the whole stack (POS + payments + books)

Goal: replace Square (POS) and QuickBooks (books) with a stack Lumenati owns end
to end, built on Stripe. Three customer-facing surfaces (a locked-iPad self
check-in kiosk, a phone payment portal for clients, and Tap-to-Pay on artist
phones), an automated payout/split engine, and our own books, so the shop runs
on software we control instead of two third-party subscriptions.

This is the contract for the POS arc. It is the sibling of `BUILD-PLAN.md` (which
covered the seven command-center features, now done). Read this first; every
`POS-STARTER-*.md` references it.

## The north star

Today: client pays on a Square reader -> Square mirror -> `sales` table; rent and
books live in QuickBooks; settlement is a manual "Mark settled" button.

Target: client checks themselves in and signs consent on a locked iPad; pays a
deposit (and the final ticket) from their own phone, or by an artist tapping
their card on the artist's iPhone; Stripe Connect auto-splits the artist's share
to their bank and keeps the shop's cut; our Reports + an expenses ledger are the
books; Stripe files the artists' 1099s. Square and QuickBooks become optional.

## The arc (one surface per session)

| # | Session | Builds | Depends on | Starter |
|---|---|---|---|---|
| 1 | Stripe foundation + client payment portal | Stripe wiring, owned `payments` table, webhook handler, hosted Checkout deposit/ticket link, public `/pay/[token]` | — | POS-STARTER-1-STRIPE-PAYMENTS.md |
| 2 | Kiosk self check-in (locked iPad) | Full-screen `/kiosk`: pick appointment, confirm info, sign consent, optional deposit | 1 (for pay), existing intake/bookings | POS-STARTER-2-KIOSK-CHECKIN.md |
| 3 | Role-tailored experiences | Per-role home + tightened nav (artist / front desk / bookkeeper / owner each their own app) | — (independent) | POS-STARTER-3-ROLE-EXPERIENCES.md |
| 4 | Cockpit + automation | Owner Overview cockpit from each feature's aggregate; auto no-show forfeit; morning brief | 1, 3 | POS-STARTER-4-COCKPIT-AUTOMATION.md |
| 5 | Stripe Connect auto-payouts | Artists as Connect Express accounts; payments split (app fee = shop cut); retire "Mark settled"; 1099 via Stripe | 1 | POS-STARTER-5-CONNECT-PAYOUTS.md |
| 6 | Artist phone app: Tap to Pay | Separate Expo/React Native app; Stripe Terminal RN SDK; in-person tap that flows through Connect | 1, 5 | POS-STARTER-6-ARTIST-TAPTOPAY-APP.md |
| 7 | Owned books + cutover | Expenses ledger, full Stripe transaction ledger, accountant export, formal Square/QBO retirement | 1, 5 | POS-STARTER-7-OWNED-BOOKS-CUTOVER.md |

Sessions 1 and 2 are pure web and reuse what is already built, so the self-serve
concept is real on an iPad with zero hardware. Session 3 is independent and can
be pulled forward any time. Sessions 5 to 7 are the heavier, higher-payoff lifts.

## The session ritual (how every session ends)

This is the rule Scott asked for. At the end of each session:

1. `npm run build` is green.
2. Fill the session's starter `STATUS` block (what shipped, files, gotchas).
3. Commit and push (one feature-shaped commit, same style as the rest of the repo).
4. **Aim the next step**: update the next session's starter so it points at exactly
   where this one left off (open seams, decisions made, what is now unblocked).
   If this session changed the plan, edit this table too.

A session is not done until the next starter is aimed. The starters are a relay
baton, not a static spec.

## Hard rules (read before writing any payment code)

- **Never touch raw card data.** Always Stripe-hosted: Checkout / Payment Element
  for web, the Terminal SDK for in-person. This keeps PCI scope at the lightest
  tier (SAQ A) and lets Stripe absorb fraud, disputes, and chargebacks. If you
  ever find yourself building an input for a card number, stop.
- **Webhooks are the source of truth for payment state**, not the browser redirect.
  A client closing the tab after paying must not lose the payment. Verify the
  Stripe signature (`STRIPE_WEBHOOK_SECRET`) and make handlers idempotent.
- **Money stays integer cents**; reuse `calc.ts`. Dates ISO. Match existing module
  conventions (auth gate copied from `app/api/rent`, RLS via `my_role()`, etc.).
- **Test mode first.** Everything ships against Stripe test keys until Scott flips
  live keys. No real charge until he says so.
- **Stripe is additive, not a rip-out.** Square keeps running in parallel until
  Session 7's cutover. Nothing here breaks the current `sales` mirror.

## Conventions specific to this arc

- **Stack additions:** the Stripe Node SDK server-side, `@stripe/stripe-js` +
  `@stripe/react-stripe-js` client-side. One new owned table, `payments` (Session
  1). Connect adds columns to `artists`, not a new table (Session 5).
- **Lanes:** each session owns its own routes/lib/schema, same as `BUILD-PLAN.md`.
  Session 1 settles the shared Stripe client (`lib/stripe/`) once; later sessions
  import it and never edit it.
- **The mobile app (Session 6) is a separate codebase** (its own repo or a
  `/mobile` workspace), because Tap to Pay needs a native build. It talks to this
  app's API; it does not live inside the Next app.

## Env (added incrementally, placeholders in .env.local.example)

```
STRIPE_SECRET_KEY=            # Session 1 (test key first)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=        # Session 1, from the Stripe CLI / dashboard
STRIPE_CONNECT_CLIENT_ID=     # Session 5
```

## Hardware notes (so nobody is surprised)

- **Locking the iPad:** Apple Guided Access (single-app, triple-click to lock) for
  one device, or MDM Single App Mode via Apple Business Manager for a fleet. No code.
- **Tap to Pay is iPhone/Android-phone only.** iPads cannot do it. The desk iPad
  takes payment via on-screen Stripe Checkout (client enters their card) or a
  paired ~$60 Stripe reader. Tap-by-touch lives on the artists' phones (Session 6).
- **Artist onboarding (Session 5)** is a one-time Stripe Express KYC step per
  artist. It is the same independent-contractor relationship, just formalized,
  and it is what lets Stripe file their 1099s.

## External needs from Scott (gate items, called out per session)

- A Stripe account + test keys (Session 1). Live keys + business verification before any real charge.
- Stripe Connect enabled on the account; artists' info for Express onboarding (Session 5).
- Apple Tap to Pay merchant enrollment + an Apple Developer account for the app (Session 6).
- The accountant's actual 1099 / books requirements, and the OK to wind down QuickBooks (Session 7).
