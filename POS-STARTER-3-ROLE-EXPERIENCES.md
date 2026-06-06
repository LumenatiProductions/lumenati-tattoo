# POS Starter 3: Role-tailored experiences

Read `POS-BUILD-PLAN.md` first. Pure web, no external accounts, independent of the
Stripe sessions, so it can be pulled forward any time. This is Scott's original
"artists see a different set than owners or front desk" idea, done properly.

## The idea in one line

Each role gets its own app, not the same command center with items hidden: a
focused landing page and a nav scoped to what that person actually does.

## What exists to build on

`role-context` already exposes the live role + an artist-preview switcher.
`AdminShell` already filters `NAV` by `role`. Every feature's provider already
exposes an aggregate (`lowStock`, `expiringSoon`, bookings `today`,
`stockValueCents`, etc.). This session composes those per role; it does not add
data.

## Owned files

`app/admin/(app)/page.tsx` (the Overview becomes a role-branching home) ·
`components/admin/home/` (one home component per role) · light edits to the nav
ordering/grouping in `AdminShell` are allowed HERE since the command-center
build is done and this is the agreed owner of that file going forward.

## The four homes

- **Artist:** my room link, my next bookings, my payout number, my compliance
  expiries. Zero shop-wide data. (RLS already scopes their reads.)
- **Front desk:** today's bookings + check-ins, new client, intake to send,
  low-stock. Operational, no money internals.
- **Bookkeeper:** Reports summary, payouts to settle, rent outstanding. Numbers.
- **Owner:** the full cockpit (Session 4 deepens this).

## Phases

1. Role-branch the home page; artist + front-desk homes first (most distinct).
2. Bookkeeper + owner homes.
3. Nav grouping per role (sections, not one flat list) and sensible default route
   per role after login.
4. Polish: empty states, "preview as" parity so the owner can see each role's home.

## External needs from Scott

Confirm the exact item set each role should see (this starter proposes a default;
he may want front desk to also see Reports, etc.).

## STATUS

Not started. Aim Session 4 (cockpit) here: the owner home built in phase 2 IS the
cockpit shell that Session 4 fills with cross-feature tiles.
