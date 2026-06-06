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

## STATUS

Not started. Independent of Sessions 5 to 7; can run right after Session 3.

**Unblocked by Session 2:** check-in persists as `bookings.checked_in_at`. The
cockpit can show "N checked in / waiting" from it, and auto no-show forfeit reads
it directly — a booking past its slot with no `checked_in_at` and a `held`
deposit (Session 1) is the forfeit candidate. Session 1 also added the `payments`
table if you want a payments tile.
