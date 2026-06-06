# POS Starter 7: Owned books + Square/QuickBooks cutover

Read `POS-BUILD-PLAN.md` first. Depends on Session 1 (payments) and Session 5
(Connect, which is where the real transaction + fee + payout records come from).
This is the session that makes QuickBooks optional and retires Square.

## The idea in one line

Add the one missing books piece (expenses), pull every transaction from Stripe
into a ledger, give the accountant a clean export, and formally wind down Square
and QuickBooks.

## What exists to build on

Reports already produces revenue, per-artist splits, deposits, supply value, and
1099 prep with CSV. Stripe (Sessions 1 + 5) already records every charge, fee,
refund, and payout. The only gap in "our own books" is recording money that goes
OUT that is not an artist split: supplies, building rent/lease, utilities, etc.

## Data model (one new owned table)

```
expenses (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  category     text not null default 'other',   -- supplies | rent | utilities | software | other
  vendor       text,
  amount_cents integer not null,
  note         text not null default '',
  receipt_url  text,
  created_at   timestamptz not null default now()
)
```
RLS owner/bookkeeper. Inventory purchases can post here automatically later.

## Owned files

`app/admin/(app)/expenses/` (or a Reports sub-tab) · `app/api/expenses/` ·
`lib/admin/expenses-context.tsx` · `supabase/expenses-schema.sql` · a
`lib/books/export.ts` that emits an accountant-ready CSV/JSON (income from Stripe +
expenses + payouts + 1099 totals) · a `CUTOVER.md` runbook.

## Phases

1. Expenses ledger (table + entry form + Reports expense line).
2. Stripe transaction ledger view (charges, fees, refunds, payouts) read from Stripe.
3. Accountant export: one file that replaces the QuickBooks hand-off.
4. Cutover runbook: stop new Square charges, reconcile the final Square period,
   confirm the accountant accepts our export, mark QBO optional.

## External needs from Scott

The accountant's actual requirements (what they need to file), confirmation they
accept our export instead of QBO, and the date to stop taking Square payments.

## STATUS

Not started. Final session of the arc. When done, update `POS-BUILD-PLAN.md`'s
north star to "done" and note what, if anything, still rides on Square/QBO.
