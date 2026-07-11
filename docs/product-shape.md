# Lumenati product shape — design doc (2026-07-11)

Scott's decisions from the pricing conversation, worked into a buildable
design. Nothing here is built yet. Anything marked **Scott's call** needs
his answer before that piece starts.

## 1. Two SKUs

| SKU | Price | Who it's for |
|-----|-------|--------------|
| Artist | $99/mo | A solo artist anywhere. Their page, their book, their money tools. |
| Shop | $199/mo base + $79/seat | A shop owner. Every chair is a seat. |

- A solo artist's $99 converts to a $79 seat the moment their shop joins.
  Frame it exactly that way in the UI: "your shop joined, your price
  dropped." It is a discount, not a capture. The artist's account, page,
  book, and history do not change owners.
- The seat is paid by the shop. If the shop lapses or removes the seat,
  the artist keeps their account and is offered the $99 solo plan; nothing
  is deleted or held hostage. That guarantee is the pitch, in writing.
- Free tier stays as is today (nothing gated mid-build; gates land at the
  end, per the standing rule).

**Scott's call:** when a shop adds an artist who already pays $99, does the
proration credit go to the artist (free days) or just switch at the next
cycle? Recommendation: switch at next cycle, artist keeps the paid month —
simplest to explain in one sentence.

## 2. Graduated payment fee

Flat percentages read unfair on big tickets; fixed cents read like a bank.
The graduated rate reads artist-first:

- **4.9% on the first $200** of a payment
- **2.9% on everything above $200**
- Instant payout: **+1.5%**, opt-in per payout, never default

Worked examples (what the UI should literally show):

| Payment | Fee | Effective |
|---------|-----|-----------|
| $50 deposit | $2.45 | 4.9% |
| $200 flash | $9.80 | 4.9% |
| $600 session | $21.40 | 3.6% |
| $1,000 day | $33.00 | 3.3% |

- Deposits and flash pay the full rate; big sessions read fair. Blended on
  real tattoo tickets this lands around 3.3–3.6%, which covers Stripe and
  leaves margin without a per-transaction fixed fee.
- **Fee transparency as a flex:** every payment's receipt view (artist
  side) breaks the fee into "card processing (Stripe)" and "Lumenati".
  No competitor shows their cut. We do, because the artist is the product.
- Applies at POS and to booking deposits the same way. One rate table,
  one implementation, shown before charging, never after.

## 3. Artist Passport

The artist account is global. Shops are stamps in it.

- An artist's page, client book, money history, leaderboards, and license
  scans belong to the artist forever. A shop membership is a dated stamp:
  where, from when, to when.
- **Moving shops = invite + one accept.** New shop sends the invite; the
  artist taps accept; done. The page moves under the new shop, the client
  book and history come along untouched, license scans carry over. The old
  shop keeps its own ledger of everything that happened under its roof —
  the record splits by venue, the artist's copy stays whole.

The three edges, resolved:

1. **Future bookings.** On accept, the artist gets one screen listing
   every future booking: default is "moves with me" (client gets a note
   with the new address), per-row option to cancel + auto-refund the
   deposit. The old shop owner sees the same list read-only. Nothing moves
   silently.
2. **Held deposits.** Deposits already land in the artist's Stripe
   account, not the shop's — so there is nothing to claw over. A deposit
   follows its booking: booking moves, deposit moves with it on paper;
   booking cancels, refund goes out from the artist's account as normal.
3. **Final rent settle-up.** Moving is never blocked by money owed
   (artist-first, always). On accept, the old shop's rent ledger closes
   with a final prorated line, both sides see the balance, and the artist
   gets the existing pay-rent-by-card link for it. The old shop's ledger
   shows it as an open receivable until paid, same as any late rent.

**Scott's call:** does the OLD shop get any veto or notice period on a
move? Recommendation: notice only (owner is informed the moment the artist
accepts), zero veto. The replacement pitch depends on artists trusting the
exit door.

## 4. Page themes

- `room_content` is already theme-agnostic data (photos, bio, song, game,
  accent). Themes are just different renderers over the same row.
- Ship 2–3 professional templates: **minimal portfolio**, **dark ink**,
  **classic flash-sheet**. Artist picks per page; switching is instant and
  loses nothing.
- The Y2K bedroom stays the Lumenati-only showroom — never offered as a
  template. Its job is to be the thing people screenshot.
- Every template page carries a small "powered by Lumenati" footer. That
  footer is the ad budget.

## Build order (proposal)

1. **Themes** — visible, low risk, no money code, makes the $99 solo SKU
   worth screenshotting.
2. **Graduated fee engine + transparency receipt** — one rate table used
   by POS and deposits; per-payment fee breakdown.
3. **SKU billing** — Stripe subscriptions for Artist/Shop+seats, the
   $99-to-$79 conversion moment.
4. **Passport** — invite/accept flow, the three edge screens. Biggest
   piece, touches everything, goes last on purpose.

Each piece is shippable alone; none blocks the others' design.
