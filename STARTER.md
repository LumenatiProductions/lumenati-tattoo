# NEXT SESSION — motionsites pass on the /shops marketing page (updated 2026-08-08)

Scott added a new MCP server, **motionsites** (user scope, so it's live in any
fresh session; load its tools with ToolSearch). The job: dig through what
motionsites offers — templates, prompts, section patterns, anything usable —
and pull the pieces that would ENHANCE the /shops app marketing page. Amplify,
don't replace: the page's structure (two buyer sections, slider, compare
table) is settled and freshly updated; this is about elevating it, not
rebuilding it. No emojis, no em dashes in copy.

## What just shipped (2026-08-08, committed on main)

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

- The full-product page walk (PAGE-WALK-NOTES.md) is still the standing
  program after the motionsites pass.
- REVIEW-TOUR.md stops 4+ (Clients onward) remain open.
