# What the shop needs from the COO and the bookkeeper

Everything the software is waiting on that is business homework, not code.
Each item says who owns it, what exactly to hand over, and what turns on
once it lands. Nothing here is blocking anything else — they can go in any
order.

## Bookkeeper

1. **Stripe activation details** — so real card payments can turn on.
   Legal entity name (LLC or sole proprietor), EIN (or SSN if sole prop),
   business address, and the bank account where card money should land.
   Scott types them into Stripe's activation form; the bookkeeper just
   needs to have them ready and correct.

2. **Sales tax rate** — the register currently charges 0% tax on merch.
   Need the correct combined rate for the shop's address (state + city +
   district), and a yes/no on whether anything we sell is exempt. Tattoo
   services vs merchandise may differ. One number entered once; the P&L
   then tracks what's owed for remittance automatically.

3. **Recurring bills list** — rent, utilities, insurance, software
   subscriptions, supplies contracts: name, amount, and due day for each.
   They get loaded once and the books post them automatically every cycle.

4. **1099 basis sign-off** — the system produces a 1099 prep report for
   booth renters (their gross earned through the shop's card reader).
   The accountant should confirm exactly which figure belongs on the
   1099-NEC before filing season.

5. **Payroll decision (Gusto)** — split and salary artists are paid
   through payroll, and the app already produces the wage numbers to type
   in. Someone needs to pick and set up the payroll provider (Gusto is
   the assumed one) and own running it.

## COO

1. **Twilio auth token** — the texting account exists and is nearly wired;
   one secret value is missing (Twilio Console, Account Info, Auth Token).
   Hand it to Scott/Claude to plug in. This turns on appointment
   reminders, waitlist offers, rent nudges, and phone-number sign-in.
   Related: the Twilio account is on a trial that only texts verified
   numbers — upgrade it so texts reach clients.

2. **Auto-send go/no-go** — once texting works, someone decides when the
   automated follow-ups (aftercare, review asks, rebook nudges) actually
   start sending. Until then they queue silently and can be sent by hand.

3. **Domain move** — the web domain lives at Squarespace; it needs to move
   so shop email can send from a real address instead of a sandbox one
   that lands in spam.

4. **Legal review of the consent form** — the waiver wording holds medical
   and ID information; a lawyer should bless it. The app shows a "pending
   review" note until that's done.

5. **Message voice pass** — the four follow-up message templates
   (aftercare, review, rebook, birthday) are placeholder wording. Rewrite
   them in the shop's voice on the Follow-ups page. No technical work.

6. **Artist logins** — each artist needs to be added on the Team page
   (name, phone, email) so they can use the app. This is also what lets
   rent nudges and open-slot offers reach them.

7. **Google review tracking keys** — the Reports page tracks review
   velocity by hand right now; with a Google Places API key + the shop's
   Place ID + the review link, it updates itself every morning and the
   review-ask emails point somewhere.

8. **Meta developer account** — needed later for the Social redesign
   (pulling artist Instagram posts in). Parked, not urgent.

## Already handled — no action

Privacy policy page, account deletion, App Store paperwork drafts, demo
account for Apple's reviewer, and the Tap to Pay recording plan are all
done or waiting only on Scott and Apple.
