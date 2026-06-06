# Starter: Reports (financials + 1099)

Read `BUILD-PLAN.md` first. Wave 3. **Read-only** — no new tables; it aggregates
existing data. Already a "soon" nav stub today. Build last so it can read every
other feature.

## The idea in one line

The numbers that run the business and satisfy the accountant: revenue and splits
over time, per-artist totals, and year-end 1099 prep for booth-renter /
split artists (who are independent contractors).

## Why it matters here specifically

Your artists pay via booth rent / split / hybrid (`artists.pay_type`), so they're
independent contractors. That means the shop needs clean per-artist annual
totals and 1099-able figures — a real bookkeeper need, not a vanity dashboard.

## What exists to build on

Everything is already in the DB: `sales` (Square mirror), `rent` (Square
invoices), `payouts`, plus `bookings` (deposits, no-show forfeits) and
`inventory` (supply spend) once those land. Reports just queries and rolls up.
Reuse the existing `calc` helpers (`fmt`, split math) used by the rent/payouts
pages — do not re-implement money math.

## Owned files

`app/admin/(app)/reports/` (replace the "soon" stub) · `app/api/reports/`
(server-side aggregation queries, owner/bookkeeper gated) ·
`lib/admin/reports-context.tsx`. **No schema file** (read-only). No cron.

## Page sketch

Date-range picker (month / quarter / year). Sections:
- Shop revenue, collected vs outstanding, shop's cut (splits) vs artist payouts.
- Per-artist table: gross tickets, tips, rent paid, split owed/paid, net to
  artist — the row that becomes their 1099 total.
- Deposits: held, applied, forfeited (from `bookings`).
- Expenses: supply spend (from `inventory`), rent.
- CSV export per section for the accountant.

Roles: owner + bookkeeper only. Artists already see their own numbers on
Payouts; Reports is the shop-wide/cross-artist view.

## Phases

1. Revenue + per-artist roll-up over a date range, CSV export.
2. 1099 view: per-artist annual totals in a copy/export-ready format.
3. Pull in deposits (bookings) and supply spend (inventory) as they exist.
4. Charts (use the existing chart approach if any; otherwise simple bars).

## External needs from Scott

What the accountant actually wants on a 1099 (gross paid to each contractor,
typically). Fiscal year start if not calendar. No external services.
