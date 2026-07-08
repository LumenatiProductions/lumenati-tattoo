# Overnight bug hunt — 2026-07-08 night

**Summary:** Walked every unwalked app screen (as test artist + owner), all
public pages, and the money math. Ten fixes shipped and pushed, the big three:
booth rent now shows the true $5,600 outstanding everywhere (June wasn't in
the app's total), evening entries no longer land on tomorrow's date (Denver
vs computer-clock bug across 17 spots), and the dashboards now read ALL
2,367 sales instead of silently stopping at 1,000. Every fix verified by
clicking it in Chrome and checking money to the penny; two design questions
left for you under "Needs Scott". Test identities created and deleted each
cycle, verified gone; nothing sent, nothing built, no database changes.

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

- **Broken healed-photo links told clients to "refresh and try again".** If a
  client's healed-photo text got cut off mid-link (happens with SMS), the page
  claimed a server problem and told them to refresh — forever. It now says
  what's true: the link isn't active, reply to the text and we'll sort it out.
  Verified: opened a garbage link in Chrome, saw the honest message; the
  server now answers "invalid link" instead of "server error".

- **Public consent-form pages still said "see the front desk".** There is no
  front desk — four messages on the public signing page now point people to
  their artist instead.
  Verified: opened the page in Chrome, new wording renders.

- **The books could undercount a busy month on Reconciliation.** The math
  behind "Stripe charged vs we recorded" silently stopped reading after 200
  card payments, 1000 tickets, 1000 cash entries, and 100 Stripe line items —
  a genuinely busy month would show a made-up mismatch. All four now read
  every row. Verified against the live shop to the penny ($720.00 card this
  month, matches everywhere), and the Reconciliation page shows green
  "square" in Chrome.

- **Evening entries were landing on tomorrow's date.** Denver evenings are
  already "tomorrow" in the computer clock the app was using. From about 6pm
  on: new cash/expense entries defaulted to tomorrow's date, the Cash Log's
  "today" total went blank, "Send now" on a follow-up quietly scheduled it
  for tomorrow, bills/licenses flipped to "due" hours early, and merch sales
  wrote tomorrow's date into the books. Every "what day is it" check on web
  and app now uses the shop's local calendar. Added an automated test that
  locks the day-boundary math down (runs in Denver time too).
  Verified: all touched pages clicked in Chrome, zero console errors,
  both sides compile, 22/22 tests.

- **The dashboards were only seeing the newest 1,000 of 2,367 sales.** The
  database hands back at most 1,000 rows per request no matter what you ask
  for. The web dashboards' sales feed asked for 3,000 and silently got 1,000
  — so all-time numbers (like an artist's career tickets/service on Artists
  & Pay) were missing everything older. It now pages through the full
  history. Verified: J.D.'s card reads 668 tickets / $196,116 service,
  matching the full ledger to the penny (before the fix it could only see
  1,000 rows total across all artists).

- **Same trap on the client roster, defused early.** The shop has 895
  clients; the web list capped at 1,000 (would have started losing people
  soon) and the phone app capped at 500 — so searching for an older client
  on the phone already came up empty. Both now page through everyone, and
  the client lifetime-value math pages too. Verified: web roster shows
  "895 shown" in Chrome.

- **Same row-cap trap fixed inside the phone app.** The app's Pay screen,
  the artist money home (You earned / tax reserve / coach), and the
  deductions list all had pulls that stop at 1,000 rows (deductions at 200).
  Nobody's numbers are wrong today — but statements sum everything since the
  last hand-off, so they'd start quietly undercounting as history grows. All
  page through now.
  Verified: artist home and Pay screen re-checked in Chrome as a test
  artist, numbers identical to before (that's the point — today they match,
  tomorrow they'd have drifted).

## Needs Scott

- **Report date ranges are anchored to the computer clock (UTC), not Denver.**
  Reports' "this month / this quarter / YTD" presets flip to the new period a
  few hours early on the last evening of a period (e.g. New Year's Eve after
  5pm). Left alone on purpose: the whole reports pipe is consistently anchored
  that way, and re-anchoring money windows deserves a decision (shop timezone
  setting?) rather than an overnight edit. Same story for the automated
  overnight jobs (follow-up sends, recurring bills) — they run on computer
  time, which shifts their "due today" by a few hours, harmless for sends
  that happen during the day.

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
- Public pages walk: booking form loads and validates; payment and aftercare
  pages fail politely on dead links; the blue-screen 404 easter egg is alive;
  /s/lumenati correctly redirects to the main Y2K site; the "Add your shop"
  wizard refuses wrong or missing invite codes (no shop was created — tested
  with a wrong code only) and the real code rides in on the invite link.
- Phone-width layout checks couldn't run: Chrome ignores the automation
  window-resize in this session. Worth a quick thumb-through on a real phone
  sometime; nothing looked suspicious at desktop width.
