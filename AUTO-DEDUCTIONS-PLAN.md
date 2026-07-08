# Auto-deductions — scope (parked, post-launch)

Scoped 2026-07-08. Not started. This is the "Robinhood for artists" tax feature:
an artist links the account they buy supplies with, the app auto-catches the
business charges, they confirm with a tap, and it flows into their deductions
and tax set-aside so the number is finally real.

## Why
Today the app sets aside ~30% of an artist's income for taxes. But tax is owed
on income MINUS write-offs (ink, needles, supplies, travel, booth rent). Artists
have to type those in by hand (the Expenses screen), so most won't, and the
set-aside is really a guess. Most supply buys are ONLINE, so the receipt is in
an email, not a shoebox — snapping photos misses the bulk of it. The one place
that sees every purchase, online or in person, is the account the artist pays
with. Connect that, and the write-offs track themselves.

## The artist's flow (plain English)
1. On their money screen: "Track your write-offs automatically." One tap opens
   the secure bank-linking screen (handled by the linking service, not us).
2. They pick their bank/card and log in THERE. We never see their password or
   card number — we get a read-only token that returns transactions.
3. The app pulls recent charges and flags the ones that look like business
   (matched by merchant — supply companies, art stores, common vendors).
4. A "Review write-offs" list: each flagged charge shows merchant, amount, date,
   and a guessed category. The artist taps ✓ business or ✗ personal. Confirmed
   ones become deductions; dismissed ones are remembered so they stop asking.
5. Their tax set-aside and "what you'll actually owe" update live. The Expenses
   screen still takes manual entries for cash buys the feed can't see.

## What we connect to
A bank-data aggregator — **Plaid** is the default (largest coverage, standard
for finance apps; MX/Finicity are alternatives). It handles the login and
credential security; we store only an access token + the returned transactions.
Card numbers and bank passwords never touch our servers (this is the same reason
it's safe — the risky part is outsourced to the specialist).

## What we store (new)
- `linked_accounts` — per artist: the aggregator item/token (encrypted), the
  institution name, last 4, status, last_synced. Artist-scoped AND shop-scoped
  (RLS: an artist sees only their own; walled per shop like everything else).
- `expense_candidates` — pulled transactions awaiting review: merchant, amount,
  date, guessed category, status (new / confirmed / dismissed), a link back to
  the account. Confirmed rows create/मirror an `artist_expenses` entry (or we
  point artist_expenses at a source_transaction_id — decide during build).
- `merchant_rules` — learned "this merchant = business, category X" per artist
  so a confirmed vendor auto-confirms next time (and dismissed ones stay hidden).
- `artist_expenses` (existing) stays the source of truth for the deduction total
  and the tax math; auto ones just flow INTO it with a source tag so the artist
  can tell auto from manual.

## How a charge becomes a deduction
Layered, cheapest first:
1. **Merchant match** — a seed list of tattoo-supply vendors + art stores +
   common categories (software, shipping) auto-labels the obvious ones.
2. **Artist confirmation** — anything unsure goes to the review list; the artist
   is the judge (a supply order is obvious, lunch is a maybe). Same human-in-the-
   loop pattern the rest of the product uses.
3. **Learning** — once confirmed/dismissed, that merchant is remembered per
   artist (merchant_rules), so the list shrinks to only genuinely new vendors.
4. **AI assist (optional, later)** — the shop brain (ANTHROPIC key already wired)
   can suggest a category from the merchant string; still artist-confirmed, never
   auto-filed.

## Email receipts = layer two (later, not v1)
The account feed knows "Supplier Co, $240"; the email order confirmation knows it
was needles and ink. That itemized detail matters for only a minority of charges,
so it's a second phase. Cheapest version: a "forward your order confirmations to
this address" inbox we parse — NOT full inbox access (reading an artist's whole
email is a privacy + Google-approval headache to avoid in v1).

## Feeding the tax number
The set-aside already knows income and a percentage. Add: net = income − confirmed
deductions; show "estimated tax owed" and "you've set aside X of it." This turns
the existing 30% guess into a real, shrinking number the artist can watch — the
fun/Robinhood hook.

## Privacy, security, compliance
- Card numbers / bank passwords never reach us (aggregator tokenizes).
- linked_accounts tokens encrypted at rest; financial data is artist-private
  (RLS: own-artist-only) and shop-walled.
- This is an ESTIMATE, not tax advice or filing. Copy must say "confirm with
  your accountant" — the app organizes, it doesn't file (same honesty as the
  existing 1099 note).
- Adds a financial-data surface: worth a quick legal skim of the aggregator's
  terms + a plain consent screen before an artist links.

## Cost & who pays
The aggregator charges a small monthly fee per connected account. Options:
(a) shop absorbs it as a perk, (b) it's a paid artist upgrade, (c) bundle into a
higher pricing tier. Ties into the existing pricing model — decide there. Cost is
the main reason this is opt-in per artist, not on-by-default.

## Phases
- **v1** — link account, merchant-match + review list + confirm, feed deductions
  + tax number, learning per merchant. The whole backbone.
- **v2** — email-forwarding address for itemized detail on the charges that need
  it.
- **v3** — AI category suggestions, year-end "here's your deductions summary /
  Schedule-C-ready export" for the artist's accountant.

## Rough size
Real feature, not a weekend. v1 is roughly: the aggregator integration + secure
token handling, 3 new tables + RLS, a sync job, the review-list UI on the app,
and wiring into the existing tax/deductions math. Call it the biggest single
artist-app feature since the money layer — but high-differentiation and squarely
on the "make artists better solopreneurs" vision.

## Open decisions for Scott
1. Who pays the per-account fee (shop perk vs artist upgrade vs pricing tier)?
2. Is this an artist-only feature, or does the shop owner get a rollup too?
3. Launch gating: definitely post-launch — after the second-shop go-live?
4. Aggregator choice (default Plaid) — any preference / existing account?
