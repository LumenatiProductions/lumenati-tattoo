# NEXT SESSION — the full-product page walk (updated 2026-08-08, second session)

The motionsites pass is DONE (same day as the marketing refresh below). What
landed on /shops, all additive: staggered hero rise, a hero proof-point row
(100% / 2 min / 30 days), scroll-reveals on every below-fold block (new
Reveal component), a cursor-following spotlight ring on the glass money
cards + the compare table (new SpotlightCard component), and the compare
table's "not included" dash is now a muted circle-x (new "close" icon in the
generated marketing icon set). Second wave after Scott flagged HIS PLAN IS
ACTIVE (premium prompts open fine through the MCP; the "3 free opens"
warning applies to plan-less accounts only): the hero headline does the
BlurText word-by-word blur dissolve, and the two money cards get a gentle
hover lift. Prompts mined: rocket-pricing, datacore-booking-hero,
bold-studio, liquid-glass-agency, liquid-glass-features, saas-pricing-flow.
Passed on: video backgrounds, serif-italic type, watermark titles (they
fight the Command Center look) and the liquid-glass top+bottom gradient
ring (changes the resting glass language; revisit only if Scott asks).

So the standing program is back on top: the FULL-PRODUCT PAGE WALK
(PAGE-WALK-NOTES.md + MC run 2026-08-03-full-product-page-walk). Page by
page through web admin, public, then the mobile app; Scott comments, we
fix, we push, next page.

## What shipped earlier the same day (2026-08-08, commit b9b0d24)

The marketing page caught up with the product:
- Hero now leads with "takes the payments"; both sections open with a
  payments tile (Tap to Pay / pay links / auto-splits).
- Retention tile covers one-message blasts to the client list; Bookings
  slide mentions waitlist slot offers; follow-ups tile mentions healed
  photos; artist plan blurb lists "your own artist page".
- "Gusto" is out of the page copy (payroll prep is now unbranded).
- Compare table gained a "Tap to Pay & pay links" row.
- Every screenshot regenerated from the demo tenant with fresh data.

## Screenshot runbook (when shots go stale again)

Dev server on :3002, Metro web on :8081, then:
1. `node scripts/seed-review-sales.mjs` — seeds the CURRENT month's demo
   sales (idempotent per month; the ledger is append-only, old rows stay).
2. Demo bookings live in July unless moved; re-date them to today via the
   Supabase service key (see this session's freshen script pattern).
3. `node scripts/marketing-shots.mjs` then `marketing-shots-artist.mjs`
   then `marketing-shots-webp.mjs`. One OTP sign-in per run (the script
   reuses the session across contexts; back-to-back runs need ~70s between
   them or the test OTP rate-limits).

## Known blemishes to fix someday

- Artist goals shot shows an absurd "$4,195/hr" (demo shop has ~5 booked
  hours against $10k of sales). Seeding more completed bookings would fix it.
- Goals chart wears a pink "behind pace" chip mid-month; reads negative in a
  marketing shot.
- `hi-coach.png` capture is text-anchored to a coach line that changed; the
  shot is skipped (unused on the page today).

## Parked (don't lose)

- REVIEW-TOUR.md stops 4+ (Clients onward) remain open.
