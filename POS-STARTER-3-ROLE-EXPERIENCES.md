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

## STATUS — built (2026-06-05)

Phases 1–2 done; Phase 3 partial; Phase 4 deferred. Pure web, no schema, no env,
no external accounts. The home was already role-branched but ran on mock cash and
ignored the new features; now each role's home is real and distinct, and
bookkeeper is split from owner.

- `app/admin/(app)/page.tsx` — now a thin role router only.
- `components/admin/home/` — one component per role + `shared.tsx`:
  - **ArtistHome** — greeting + their earnings/tips/net/tickets, their upcoming
    bookings, recent work. No shop-wide data (compliance is owner-only, omitted).
  - **FrontDeskHome** — today's schedule (real bookings + deposit badges),
    deposits held, low stock, follow-ups due, and the front-of-house quick
    actions (new client / send intake / bookings / cash). No money internals.
  - **BookkeeperHome** — numbers only: revenue, payouts owed, rent, cash to
    reconcile, statements + rent panel, straight link to Reports.
  - **OwnerHome** — a cross-feature "needs attention" strip (appointments today,
    deposits held, low stock, licenses expiring, follow-ups due) ON TOP of the
    full financial view. This strip is the cockpit seed.
- Reuses live aggregates already exposed by each provider (`useBookings().today`
  /`depositsHeld`, `useInventory().lowStock`, `useCompliance().expiringSoon`,
  `useFollowups().dueToday`). Non-owner roles that hit owner-only data get an
  empty list via the context's 403 handling, not an error.
- `npm run build` green.

**Deferred:** nav SECTION grouping in AdminShell (the nav already filters by role,
so each role sees a different set; grouping into labeled sections is the polish
left). Per-role default route is effectively done — everyone lands on the
role-routed `/admin`. Phase 4 attract/preview polish also left.

### Aimed at Session 4 (cockpit)
`OwnerHome`'s "needs attention" strip is the cockpit shell to deepen: turn those
five tiles into a ranked, action-first list, add the auto no-show forfeit (reads
`bookings.checked_in_at` from Session 2 + the `held` deposit from Session 1), and
wire the morning brief. Build the cockpit by extending `components/admin/home/`.
