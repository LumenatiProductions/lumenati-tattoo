# POS Starter 4: Cockpit + automation

Read `POS-BUILD-PLAN.md` first. Depends on Session 1 (payments) and Session 3 (the
owner home shell). This is the `BUILD-PLAN.md` "Overview integration pass" plus
the first real background automation.

## The idea in one line

One owner cockpit that pulls every feature's aggregate into a single glance, and
a few jobs that act on their own instead of waiting for a human.

## What exists to build on

Each provider already exposes its Overview aggregate (`useBookings().today`,
`useCompliance().expiringSoon`, `useInventory().lowStock`,
`useReports()` summary). The ops fan-out (`/api/ops/daily`) and weekly digest
(`/api/digest`) already exist. This session composes and schedules; it mostly
wires, it does not invent new data.

## Owned files

`app/admin/(app)/page.tsx` owner branch (cockpit tiles) ·
`components/admin/cockpit/` · a new `lib/automation/no-show.ts` invoked from the
existing `/api/ops/daily` fan-out (no new cron, per the once-daily cap).

## What the cockpit shows

Today's bookings + check-ins, deposits held, low stock with reorder links,
compliance expiring, this-period revenue and "to settle", and anything needing a
decision. Action-first: each tile links straight to the thing to do.

## Automation in this session

- **Auto no-show forfeit:** the daily job flags bookings past their slot still in
  `held`-deposit + no completion, transitions deposit to `forfeited` (shop keeps
  it), and notes it. Ties bookings + Session 1 payments together.
- **Morning brief:** extend the daily fan-out to email the owner a one-screen
  "here is today" (bookings, low stock, expiries, deposits to chase).

## Phases

1. Cockpit tiles from existing aggregates.
2. Auto no-show forfeit in the daily job.
3. Morning brief email.
4. "Needs attention" inbox: a single ranked list across features.

## External needs from Scott

Confirm the no-show grace window (e.g. forfeit a held deposit N hours after a
missed slot) and what belongs in the morning brief.

## STATUS — built (2026-06-05)

All four phases shipped. No schema (uses Session 2's `checked_in_at`), no new
cron (rides the existing daily fan-out). The morning brief emails only when
`RESEND_API_KEY` is set; the no-show forfeit is dry-run until opted in.

- `components/admin/cockpit/Cockpit.tsx` — the owner cockpit: a glance row of
  five tiles (today checked-in/total, deposits held, low stock, licenses
  expiring, follow-ups due) + a single **ranked "needs attention" list** (high/
  med/low), each row linking straight to where you act. Replaces OwnerHome's old
  static strip. Phases 1 + 4 (the inbox).
- `lib/automation/no-show.ts` — `runNoShowForfeit`: finds bookings past the grace
  window (`NO_SHOW_GRACE_HOURS`, default 24) with a `held` deposit, no
  `checked_in_at`, still `scheduled`, and forfeits the deposit (+ marks
  `no_show`). **OPT-IN**: reports candidates only until `NO_SHOW_AUTOFORFEIT=1`,
  so it can never wrongly forfeit a real client's deposit. Phase 2.
- `lib/automation/brief.ts` — `runMorningBrief`: a one-screen "today at the shop"
  email (appointments + who's checked in, deposits held, no-show candidates,
  reorders, compliance) via Resend. Phase 3.
- `app/api/ops/daily/route.ts` — wires both in LAST (no-show before brief so the
  brief reflects the settled state). Cron already runs 15:00 UTC (~9am Denver).
- `lib/admin/bookings-context.tsx` — added `checked_in_at` to the `Booking` type
  (already in the `*` payload; type-only) so the cockpit can show checked-in counts.
- `npm run build` green.

**Gate items for Scott:** confirm the no-show grace window, then set
`NO_SHOW_AUTOFORFEIT=1` to arm it. The brief needs `RESEND_API_KEY` (already used
by the other digests).

### Next in the arc → Session 5 (Connect)
Cockpit + automation are independent of payments rails. Session 5 (Stripe
Connect auto-payouts) is the next POS step: it turns the manual Payouts "Mark
settled" into automatic splits and reuses Session 1's `payments` flow.
