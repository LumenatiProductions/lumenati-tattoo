# NEXT SESSION — the full-product page walk (updated 2026-08-08, end of day)

The marketing overhaul SHIPPED: 11 commits pushed to main (b422389..cd9c414)
and auto-deploy is WORKING again (the push deployed itself; no manual vercel
needed). Scott's parting note: "we have lots of work to do" — the standing
program is the FULL-PRODUCT PAGE WALK (PAGE-WALK-NOTES.md + MC run
2026-08-03-full-product-page-walk). Page by page through web admin, public,
then the mobile app; Scott comments, we fix, we push, next page.

## What /shops is now (one day, 11 commits)

Hero: blur-in headline, rotating verb line ("It takes the payments." etc),
"You bring the needle." kicker, two-cell ArrowCta (arrow flies on hover),
proof-point row. A slow feature marquee. Artist section: glass benefit
tiles, then the SCROLL TAKEOVER — the demo phone grows, pulls right, and
your scroll scrolls a real full-height capture of the artist home while
big headlines swap on the left. Shop section: glass tiles, then the DECK —
five purpose-cut back-office screens stack like sheets (strips are the
clickable tabs). Compare table with spotlight ring + glow on money cards
and the Founding pill. Fixed header that hides past the hero. Everything
honors reduced-motion; mobile keeps carousel/slider, no scroll-jacking.

## Real product fixes that rode along (in the app, not just marketing)

- MoneyChart pace math: prorates by days-in-range now (was racing the FULL
  goal from day one — everyone read "behind pace" all month). Needs an OTA
  to reach devices; ships with the next app change Scott approves.
- /api/reports booth rent reads rent_invoices (in-house engine), not the
  dead Lumenati-only Square path.
- app/globals.css: overflow-x is `clip` not `hidden` (hidden silently kills
  position:sticky site-wide; old-Safari fallback kept).

## The demo tenant is now THE PERFECT ACCOUNT

scripts/seed-perfect-demo.mjs (idempotent, demo-perfect tag): real session
titles, ~47 booked hrs (hourly $175/hr), booked week w/ held deposits, rent
$1,000/mo paid 3 months, 8 deductions YTD, Max on a 40% split, all clients
have email+phone, follow-ups dated around today. Re-dress + recapture:
1. node scripts/seed-review-sales.mjs   (current-month sales)
2. node scripts/seed-perfect-demo.mjs   (the dressing)
3. node scripts/marketing-shots.mjs     (web pages; test OTP, ~70s gap)
4. node scripts/marketing-shots-deck.mjs      (purpose-cut 16:10 deck crops)
5. node scripts/marketing-shots-artist.mjs    (3 phone stills)
6. node scripts/marketing-shots-artist-tall.mjs (full-height app scroll;
   needs Metro web on :8081 — start WITHOUT CI=1 or it never rebuilds)
7. node scripts/marketing-shots-webp.mjs
Also scripts/record-admin-drive.mjs records a Command Center screen video
(kept for future use; the scrubbed-video section was cut as redundant).

## Known blemishes / walk candidates

- Pay page: two "Not set up" Stripe chips in demo shots (real Connect
  status; consider a test-mode connected account for the demo shop).
- Dev-session /shops errors land in prod ops_events as null-shop rows and
  pollute the demo overview's Needs-attention — resolve via resolved_at
  before desktop shots (happened twice today).
- Reports "Rent collected" tile: sub-copy still says "Square not linked"
  wording in some states — re-check after the rent-source fix.
- REVIEW-TOUR.md stops 4+ (Clients onward) remain open.
