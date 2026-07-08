# Overnight bug hunt — autonomous session rules

Scott is asleep. Nobody is watching. The ONLY job is: find bugs, edge cases,
and broken stuff; fix them; prove the fix; commit; push when green; log it.
No new features, no backlog items, no product decisions.

## HARD SAFETY ENVELOPE (never cross, no exceptions)

1. NO live-database schema or policy changes. No migrations, no RLS edits,
   no column changes, no Management API DDL. Read the DB freely; if a fix
   NEEDS a schema change, log it as a finding and move on.
2. NO eas build, NO eas update, NO TestFlight/Play anything.
3. NO real sends: no SMS (Twilio), no emails, no push notifications, no
   Stripe charges. Use dry-run modes (?dry=1) where they exist. Never
   flip FOLLOWUPS_AUTOSEND or any env var.
4. NO Square API writes. NEVER flag Square data quirks (standing rule).
5. Test data in the live DB only through the app's own flows, always named
   so it screams test (client "OVERNIGHT TEST"), and ALWAYS cleaned up in
   the same cycle (void/cancel/delete via UI or the documented rituals).
   Disposable auth identities per STARTER-NEXT recipe; delete profile +
   auth user after every use, verify empty.
6. Reuse Scott's running servers (web :3002, Metro :8081). Never kill
   Metro. Chrome MCP only, own tab group, never computer-use.
7. Push to main ONLY after the full gate passes (below). If anything is
   uncertain, commit locally, don't push, log why. A skipped push is fine;
   a broken deploy is not.
8. Secrets stay put: no printing keys into logs/commits, no .env edits.
9. If something looks like it needs Scott (design call, money-model
   question, anything ambiguous): DON'T build. Log it in OVERNIGHT-LOG.md
   under "Needs Scott" and move to the next target.

## The gate (every fix, before push)

- `npx tsc --noEmit` clean in repo root AND app-native.
- `npx vitest run` all green; add/extend a test when the fix is money math
  or logic (calc, pnl, reports).
- The touched flow CLICKED in Chrome (web page or Expo web) — seeing the
  fix render, not just compile. Money numbers verified to the penny.
- Commit message: what was broken, what fixed it, how it was verified.

## Where to hunt (in order, one target per cycle)

1. Pay-model ripple: grep for leftover old vocabulary — pay_type values
   'rent'/'split'/'hybrid', "Payouts owed", "settle up", "cash out",
   "who writes whom a check" — in UI copy, comments matter less. Check
   every page that shows money renders sanely with the new model.
2. Unwalked app screens (from STARTER-NEXT): cash, clients, my-clients,
   compliance, expenses, followups, goals, healed-shots, intake,
   integrations, inventory, payouts, promos, qr-card, reconcile, rent,
   reports, room, social, staff, waitlist. Load each in Expo web with a
   disposable artist AND as owner: crashes, dead buttons, empty-state
   gibberish, console errors, obviously wrong numbers.
3. Unwalked public pages: /book, /request, /pay, /intake, /care, /healed,
   /claim, /s/<shop>, /start (wizard is code-gated — verify the gate, do
   not create shops). Broken links, 404s, mobile-width breakage, forms
   that error.
4. Edge cases in money math: $0 tickets, refund rows, reversed ledger
   entries, artists with no sales, month boundaries, the PostgREST
   1000-row cap on any new aggregation path.
5. Empty/error states: what does every page do with zero data, a failed
   fetch, a slow API? No white screens, no NaN, no "$NaN", no unhandled
   promise rejections in the console.
6. Date/time: local-vs-UTC drift on "today" boundaries (Denver), booking
   writes as real instants (toISOString — known rule).
7. `npx next lint` and fix real warnings in touched files (don't
   mass-reformat the repo).

## Logging

Append every cycle to OVERNIGHT-LOG.md (create it, keep it untracked-ish —
commit it at the end): target, what was found, fixed or logged, how
verified, commit hash. Three sections: "Fixed", "Needs Scott", "Checked
clean". Scott reads this over coffee — plain English, no jargon.

## Stop conditions

- 8:00 AM local, OR the target list is exhausted, OR two consecutive
  cycles find nothing new. On stop: make sure the tree is clean and
  pushed if green, finish OVERNIGHT-LOG.md with a 5-line summary at the
  top, and end the loop.
