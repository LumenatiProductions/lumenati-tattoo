# Page walk with Scott — 2026-07-08 — running notes

Interactive walk of every page. Capture feedback per page; act when Scott says
or when the walk reaches the natural home for the change.

## 1. Overview — quick buttons (DONE)
Buttons under Needs Attention read like page tabs. Removed the sidebar
duplicates (Bookings/Payouts/Reports on owner home; Send intake/Bookings/Cash
log on front-desk home). Kept only "New client" on both. Verified in Chrome.

## 2. Overview / Artists & Pay — the real pay model (BIG, rebuild at /artists)
Three pay setups, not one:
- **Split artists**: split % is real, but they're paid via GUSTO payroll.
  The app doesn't settle up; it produces payroll-prep numbers to type into
  Gusto each pay period.
- **Booth renters**: collect from clients on the SHOP's reader, but the money
  is theirs. Shop holds it and passes it through. Their statement = sales
  we're holding minus rent owed. They owe rent, not the other way.
- **J.D. Pruitt**: shop OWNER, salary, no split. Currently modeled as 35%
  split with $84,470 "owed" — wrong. He should not appear in statements.
Implications: "Payouts owed" tile and "Settle up" flow assume shop cuts
checks through the app — replace with the three-flavor model. Artists need a
pay-type field (split-payroll / booth-rent / owner-salary).

## 3. Booth rent invoicing + nudges (NEW feature)
- Auto-send a rent invoice to each booth renter at the START of each month.
- Payment nudges until paid.
- Coach angle: help a renter understand how much they need to tattoo to make
  rent (ties into goals).
- Loyalty idea (design later, Scott: "or something"): pay rent on time every
  month -> discount on the final month of the year.

## 4. My Room / public rooms (GREENLIT, build after the walk)
- Posters + stickers are baked in from J.D.'s room, same for every artist,
  no editor control. Build a picker (choose which stickers/posters, keep the
  moveable behavior) in My Room.
- Accent color does NOT reach the main artists page (colors hand-coded
  there). Make the roster read each artist's saved accent so they never
  drift.
- Song picker is preview-only; the public room has NO music player. Build a
  retro player window driven by the picker, using a Spotify embed (visitors
  not logged into Spotify hear a 30-sec preview; that's a licensing rule).
  Scott OK with embed approach.

## 5. ARTIST-DRIVEN SHOP (core principle, Scott 2026-07-08) + Bookings
There is NO front desk. The shop is run entirely by the artists; the product
must give each artist full power over their own world.
- Artists mark their OWN bookings completed / no-show in the app (today
  staff-only; artists can only cancel). Deposit keeps following status
  automatically (completed -> applied, no-show -> forfeited). Needs RLS +
  guard-trigger extension like the artist-cancel one, plus app UI pills.
- AUDIT all isStaff gates in the app: anything about an artist's own
  clients/schedule/money flips to artist-allowed. Cross-artist edits stay
  staff/admin.
- Bookings page itself: no other changes requested. (No-show rate reads 100%
  because the only settled bookings are old test rows.)

## 6. Clients — messy Square data + future cutover
- Some ARTISTS appear as clients (Square messiness, e.g. Sam Durbin with
  $6,600 "spend"). Cleanup pass: match client book against artist roster,
  tag/hide those records from the roster + returning-rate math, KEEP their
  money history (feeds the books). Deliberate pass, not a delete.
- Future: DROP Square entirely and start over; keep Square data as
  historical only. Mechanically: turn off nightly sync, badge old records
  as historical. App becomes sole source of truth from cutover day.

## 7. Intake & Consent
- Artists CANNOT send forms today (app intake gated to owner/bookkeeper/
  frontdesk). Flip per artist-driven rule: artist sends forms to own clients.
- Bundle consent form with the DEPOSIT: creating a booking auto-creates the
  intake form and sends ONE text/email containing deposit link + sign link.
- Kiosk already prompts unsigned arrivals into the signing flow (verified in
  code). No change needed there.
- Aftercare signoff = required checkbox in the consent form acknowledging
  aftercare instructions; stored with the signature. (Distinct from the
  post-visit /care healing-timeline link.)

## 8. Follow-ups — artist-driven close-out (GREENLIT)
- Payment flow and follow-ups are disconnected today: tap-to-pay doesn't know
  its booking; drip starts only via completed-booking + scan (nightly/manual).
- Build the close-out moment: end of payment flow, artist confirms which
  booking it was -> one tap = payment recorded + booking completed + aftercare
  drip queued immediately + "drip started" confirmation.
- App follow-ups screen: scope to the artist's OWN clients (today it shows the
  whole shop queue, bump/skip only).

## 9. Social — REDESIGN (Scott: current page is wrong)
Purpose: manage the SHOP Instagram via the artists' posts.
- Monitor all artists' IG accounts (Business Discovery API; artists must be
  business/creator accounts) -> one feed of their latest posts.
- One-tap REPOST an artist post to the shop IG with credit (Content
  Publishing API; shop account connected via Meta app, needs app review).
- Track what's been reposted / per-artist coverage so the shop grid stays
  balanced.
- Later: ad generator (turn a proven post into an ad, Marketing API).
Replaces the manual paste-a-link wall entirely.

## 10. P&L addendum (ties into note 2 pay model)
- Booth-renter sales collected on the shop reader stay VISIBLE as flow-through
  ("gross collected" / money through the shop, labeled pass-through) but never
  count toward shop income/profit. Scott wants to see total money moving
  through the shop alongside what's actually the shop's.
- No other P&L changes; expenses/tax-rate emptiness is checklist work, not
  build work.

## 11. Pay model refinements (Scott, on Payouts page)
- J.D. is on Gusto too (salary). Gusto bucket = all payroll people: split
  artists + salaried owner. App produces payroll-prep numbers for all.
- The shop WITHHOLDS NOTHING from artists. Renters get 100% of their card
  sales passed through. Rent is billed separately (monthly invoice + nudges),
  never netted against their money.
- Artist app RENT COACH (advisory only): "rent is $X, you have N appts
  booked, set aside ~$Y each" — updates with bookings, nudges when pace is
  off. Ties into goals + tax set-aside brain. No enforcement.

## 12. Cash Log — REDESIGN (record once, confirm handoffs)
Reality: split artists collect cash -> hand to JD -> JD records -> Stephanie
punches it in. Rent sometimes paid in cash. Three handlings of one dollar.
New flow:
- Artist logs cash at the source via the one-tap close-out (note 8):
  "paid cash $X" -> split math automatic, app knows artist holds shop's cut.
- Two-tap handoff: artist taps "handed off," JD taps "got it" -> line clears,
  books update. Same for cash rent (artist taps paid-cash, JD confirms).
- Stephanie: no data entry; Reconciliation becomes "app says JD holds $X,
  confirm the count."
- Cash Log page becomes "cash the shop is holding" (JD's box, live), not a
  front-desk drawer.

## 13. Photo proof on cash + expenses (Scott)
- Cash handoff confirm (note 12) gets an optional snap-a-photo of the stack,
  stored on the entry.
- Shop expense entries get a receipt-photo attachment (pattern/storage
  already exists for artist deduction receipts).

## 14. Expenses boundary (Scott, noting)
Shop provides SOME supplies to artists, not everything. Shop-bought =
shop expense (+ Inventory); artist-bought = their personal deduction in the
app. Keep that boundary explicit in pay-model + deductions work.

## 15. Artists & Pay — final buckets (Scott)
- GUSTO PAYROLL: J.D. (salary), King Kalypso (split), Moonie B. Jones
  (split, guest tag stays).
- BOOTH RENT: Electric Elaine, ShorTy (drop the hybrid type — unused),
  Sam Durbin-Clark.
- Exact %s / rent amounts: Scott sets at launch via Edit pay. Types now,
  numbers later.

## 16. Compliance — document photos (Scott)
- Add photo/document attachment to compliance items: app camera + web
  upload; stored on the item; two-tap show-it view (inspector/guest-spot).
- Renewal warnings already exist (30-day, app + email + owner rollup).
- Nice-to-have later: read expiry date off the photo so renewal = snap.

## 17. Roles — admins + artists ONLY (Scott)
Collapse frontdesk/bookkeeper role types into admin everywhere (web, app,
RLS policies, api-auth). Stephanie = admin. Part of the artist-driven audit.

## 18. Integrations — "Sunset Square" cutover button (GREENLIT)
One click + confirm on /admin/integrations: stops nightly sync permanently,
stamps all imported data historical, page becomes "Square retired <date>".
The fresh-start moment made explicit.

## 19. App home screen (walk)
- Spacing fix SHIPPED: gap added between Your Day card and week/month/year
  pills (verified in Chrome mobile-ratio).
- Coach tax advice must become pay-type aware: contractor/1099 advice for
  booth renters; "Gusto withholds, check your stub" for payroll artists.
- Cash out early = real Stripe instant payout (~1.5% fee, needs connected
  bank + cleared funds). Show for RENTERS only; hide for payroll artists.

## 20. Cash out early — CUT (Scott + reasoning)
Shop holds nothing back from renters (pass-through automatic) and payroll
artists get paid via Gusto, so "cash out early" is just paying 1.5% to skip
Stripe's standard 2-day settlement. Remove the button + /cashout screen from
the app home. Capability stays at Stripe if ever wanted again.

## 21. Tap to Pay go-live bundle (not build work)
Flow already proven on sandbox/test payments. Remaining to take real money:
live Stripe keys (checklist), Apple production Tap to Pay entitlement
approval (incl. demonstrating the flow / video), real-phone verification of
the payment done screen (owed item). Also: POS web fallback layout is shoved
off-screen left in narrow Chrome — cosmetic, web-only, fix in polish pass.

## 22. Coach + header polish
- Coach cards get ONE action tap each (GREENLIT): healed-shots card -> Healed
  Shots, Friday card -> Friday's book, tax card -> Goals set-aside, future
  rent card -> rent progress. Never a menu.
- Header flash fix SHIPPED: themed header defaults at the Stack level in the
  app layout (dark bg, light tint, no shadow, minimal back) so back buttons
  stop flashing system blue during transitions. Verify on sim/native next
  reload.

## 23. Public site + platform-wide layout (Scott, mid-walk batch)
- Hero CTA fix SHIPPED: Get Inked / Flash Wall now a centered row BELOW the
  centered intro text (was side-by-side with text).
- Flash wall is EMPTY on the site. Build: artists add flash (design + price)
  from their app; wall renders per-artist flash with claim/book hooks.
- Expo web stretch fix SHIPPED: app-in-browser capped at 560px centered.
- BIG: desktop Command Center needs a real mobile-browser layout (sidebar ->
  bottom tabs/drawer, cards stack, tables scroll). "Match the app" feel.
- "Add walk-in" renamed "New client" SHIPPED. Build: inline new-client
  creation inside New Booking + New Intake forms (name + phone, no leaving
  the form).

## 24. Intake NEW FORM flow — confusing (Scott)
Today: fill optional booking/placement/client/artist -> Start form -> bare
link with copy/open. Redesign: client-first (required, inline-create),
booking auto-suggested; after create show explicit next actions "Text to
<phone> / Email to <email> / Open on this tablet" + one-line explainer that
nothing sends until chosen. Link stays visible as fallback.

## 25. Room build scope EXPANDED (Scott) + Winamp discovery
- Artists manage EVERYTHING on their room from the APP: upload/arrange
  profile photo, polaroids, portfolio (app currently profile-photo-only,
  "curation lives in the web editor for now"), plus sticker/poster picker.
- Music: the main site already has a working Winamp widget (plays J.D.'s
  song). Room music = mount that per-room wired to the artist's song pick,
  not a new build.

## 26. No-preference bookings — "Up for grabs" pool (GREENLIT)
Today: request w/o artist preference = booking with artist_id null; visible
to all in app but unclaimable (admin-assign only). Build: "Up for grabs"
badge + push to all artists; first tap claims (atomic, no double-claim);
claim enters normal confirm flow; artist cancel returns it to the pool.
