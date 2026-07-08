# Overnight bug hunt — 2026-07-08 night

(Summary gets written here when the run ends.)

## Fixed

- **The phone app's Booth Rent screen hid past-month rent from the total.**
  Same blind spot the web had: the big "Outstanding" number only counted July,
  so it said $2,800 owed when the real number is $5,600 (June's three unpaid
  invoices weren't in it). Now the total counts every unpaid invoice from any
  month ("6 unpaid, 3 from past months") and June's rows carry a PAST MONTH
  tag with their own Mark paid button.
  Verified: opened the screen in Chrome as a test owner, saw $5,600 / 6 rows /
  June tagged; checked against the live invoices to the penny.

- **Console error on the app's Clients screen.** One old client record has a
  blank-text phone number (instead of "no phone"), and the screen tripped over
  it on every load. Hardened the screen so blank text can't break the row.
  Verified: reloaded Clients in Chrome as a test artist, zero console errors.
  Current signup/booking flows already store "no phone" correctly, so no new
  records can be born broken.

- **Artists opening Reports or Reconciliation saw a raw "Failed to fetch".**
  Those two screens are owner/bookkeeper-only on the server, but the app fired
  the doomed request anyway and showed the raw error. They now show the same
  clean "Owners & bookkeepers only." card that Staff and Integrations use
  (and skip the pointless request).
  Verified: opened both as a test artist in Chrome, clean gate; as a test
  owner the screens behave as before.

- **Emoji cleanup (house rule: no emojis anywhere).** The camera emoji on the
  Deductions screen's "Snap a receipt" button and a party emoji in the daily
  digest email are gone.
  Verified: Deductions screen re-checked in Chrome; digest is copy-only.

- **Unpaid rent from past months was invisible to the admin.** The Booth Rent
  page's in-house list only showed the current month, so June's three unpaid
  invoices ($2,800 across Elaine, Sam, ShorTy) could never be chased from the
  web. Now every unpaid invoice stays visible with a PAST MONTH tag until it's
  paid; each row shows its own month instead of assuming the current one. Also
  fixed stale "rent/hybrid artist" wording to "booth renter".
  Verified: all 6 unpaid rows render in Chrome (June tagged PAST MONTH),
  tsc both sides clean, 20/20 tests. Commit: (this one).

## Needs Scott

- **Tax set-aside default for payroll artists.** The app's tax reserve and
  goals dial default everyone to a 30% set-aside. For W-2 payroll artists
  (J.D., Kalypso, Moonie) taxes already come out of their Gusto paychecks, so
  30% is probably too aggressive a default — the copy already explains it
  right, this is only about the starting number. Design call: keep 30% for
  everyone, or start payroll folks lower (e.g. 10% for cash tips)?

## Checked clean

- Old pay-model vocabulary sweep: no leftover 'rent'/'split'/'hybrid' pay-type
  branches, no "Payouts owed"/"settle up"/"cash out" copy anywhere in web or
  app code. The two-shop test script inherits the new pay-type default safely.
- Rent invoice generation on the live DB made invoices for exactly the three
  booth renters (June + July), nobody else.
- Full app screen walk (all 21 non-walked screens) as a disposable test
  artist AND a disposable test owner in Chrome: no crashes, no white screens,
  empty states read fine, gates hold (Staff/Integrations owners-only, artist
  sees only their own money). Owner home's week numbers match the live sales
  table to the penny ($720 / 5 tickets). Test identities deleted after.
- Reports + Reconciliation show "Failed to fetch" when the app runs in a
  desktop browser during development — that's a browser cross-site guard
  against the live API and does not happen on phones. Nothing to fix.
- Goals screen already adapts its tax advice to pay type (renter = 1099,
  payroll = W-2 wording) — the rebuild's wiring is live.
- `npx next lint` isn't set up in this repo (prompts to install a config);
  skipped rather than adding new tooling overnight.
