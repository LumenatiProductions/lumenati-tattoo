# NEXT SESSION — Lumenati (updated 2026-09-02, late: the polish walk)

## Where things stand

- **lumenatitattoo.com is live on Vercel.** DNS on Vercel nameservers, registration
  still at Squarespace. Google mail, SPF, DKIM, DMARC carried over. Zero Squarespace
  CDN dependency left; the Squarespace SITE subscription can be cancelled (keep the
  domain registration there).
- **Coming-soon cover is ON** (`SITE_COMING_SOON=true` on Vercel). Covers the Y2K
  pages; /request, /privacy, /terms, /admin, /shops, /kiosk etc. stay live. Bypass:
  any page with `?preview=1` (30-day cookie). Lift it: remove the env var, redeploy.
  **9/2 pm: the cover IS the Lumenati OnLine sign-on** (legacy/aol-signon.html, Mac
  AOL 3.0 Welcome window, Grok's brand set in public/brand): Sign On dials, two steps,
  then a Mac busy-signal alert with contact + Get Inked. Lift the cover and the same
  screen connects for real (it also fronts the real site; `?intro=1` replays it).
- **Email works for real now.** Resend domain mail.lumenatitattoo.com verified;
  `RESEND_FROM` set; Supabase Auth sends sign-in codes from
  signin@mail.lumenatitattoo.com. lum-034 fixed, back to Grok to verify.
- **Twilio A2P refiled** with PrivacyPolicyUrl + TermsAndConditionsUrl (the real cause
  of every rejection). Status was IN_PROGRESS at 12:30 PM MT; check with
  `node scripts/a2p-resubmit.mjs --dry` (prints current status first).
- **Artists are self-serve on the site.** Admin -> Artists -> Add artist = row + room;
  homepage Crew builds from the roster (60s cache); rooms render live. Six originals'
  galleries + real IG handles seeded into room_content.
- **Arcade menu shows game screenshots** (rooms) and the **kiosk has an ARCADE
  button** (attract screen, TV remote row).
- **Flash wall parked** (/flash-wall -> /, hero button commented out) until real flash
  is pinned. Its query is now shop-scoped (had been showing the demo tenant's pieces).

- **Kiosk TV rebuilt 9/2 pm:** 158 channels in `lib/kiosk/tv-channels.ts` (TV blocks,
  MTV/VH1 off-air recordings, video DJ mixes, 69 official music videos as an MTV
  run from CH 111), captions off, TV mutes when the arcade opens, big back button,
  Prevue-style GUIDE (crawls, tap tunes). `scripts/tv-check.mjs` proves a channel
  plays inside an embed on the LIVE domain. NEVER judge a channel on :3002: YouTube
  refuses licensed videos to localhost embeds ("unavailable"), they play live.
- **Rooms: ONE song per artist, from the lineup (9/2 pm).** `room_content.tv_video_id`
  (legacy `song_id` mapped via LEGACY_SONG_TO_TV; all 8 rows migrated). On a room
  page Winamp's playlist = the 71 music videos, starting on the pick, sound from a
  YouTube player parked offscreen inside a Windows Media Player window; the MTV
  desktop icon slides that window in (same player). Homepage Winamp still m4a.
  Pickers: admin Room page (Vibe) + app My Page search (`/api/tv-channels`).
- **Rooms, 9/2 evening:** windows size to content; site-wide pointer drag engine in
  the footer bundle (freezes flow, raises grabbed item, stickers grabbable through the
  header/polaroid/icon layers). Drops persist: per browser (localStorage `lmn-desk:<id>`)
  and, when owner/artist is signed in, to `room_content.layout` via PATCH
  `/api/room/layout` (toast "Desk saved for everyone"; reset-desk button). Unset rooms
  (all but JD) show placeholders: UNDER CONSTRUCTION poster, gray polaroids, classic
  stickers, Squarespace card photo as profile. Every Book door = `/request?artist=<id>`
  labeled "Book with <Full Name>" ("Join <Name>'s waitlist" when closed). Address is
  3100 N Downing St everywhere. Legacy images: `scripts/optimize-legacy-assets.mjs`
  writes WebP + `webpifyLegacyAssets()` rewrites any path at render.

## Priority 1: the polish walk (Scott, end of 9/2: "polish this fucking thing to the max")

Page by page, together, one change at a time. Scott clears each page before we
move on (never jump ahead). Order:
1. **Desktop Command Center (`/admin`, dev on 127.0.0.1:3002, Scott's cookie there).**
   Start at the top of the nav and go down. On each page: open it in Chrome, look at
   it with Scott, fix what he calls out, re-check, then next page.
2. **Phone app (`app-native`, Expo).** Same drill, screen by screen: Today, Bookings,
   Clients, Cash, My Page, Settings... Use Scott's Metro (never kill it) and the sim
   or Expo web on :8081 (`npx expo start --web`, App Review phone (500)555-0100 /
   000000 per the QA memory).
Rules of the walk: minimum change per ask, amplify don't replace, plain-English
labels, no emojis/em dashes, verify in Chrome before saying done. Log anything
bigger than a tweak as a follow-up at the bottom of this file instead of derailing.

## Parked (not for the walk)
- Platform name + Cloudflare domain: Scott's pick (shortlist below).
- Twilio A2P campaign QE2c6890da8086d771620e9b13fadeba0b: refiled 9/2 6:45 PM
  after 30913 (marketing consent separated); IN_PROGRESS = human review. Check
  with `node scripts/a2p-resubmit.mjs --dry`. When VERIFIED, SMS turns on by itself.
- One quick check Scott hasn't done yet: signed into admin, move a window in any
  room -> toast "Desk saved for everyone" (saves room_content.layout). Visitors got
  a 401 as designed; the owner path is untested.
- lum-021 still with Grok. The QA board has nothing waiting on the builder.

## Platform name shortlist (Scott's call)

**9/3 naming round (~110 names checked live against the .com/.app/.ink registries,
top 5 web-searched for product collisions; trademark NOT yet checked):**
- Inkonto (.com .app .ink all free; only hits are Zambian song titles). "Konto/conto"
  = account in German/Italian. Coined, 3 syllables, sounds like a real company. Top pick.
- Inkcount (.com .app .ink free; no product found). Account hidden in ink, plain.
- Inktabs (.com .app .ink free; no product found). Running a tab / keeping tabs.
- Inkregister (.com .app .ink free; note InkRecord.com exists, EU consent tool).
- Needlebooks (.com .app .ink free; a needlepoint hobby app "needlebook" exists).
Also free .com: inkometer, inkcountant, inkbanker, inkstatement, inkclock, earnink,
inkearn, inkvoices, inkquity (reads like "iniquity", skip). Taken .com: inkvoice,
profink, inkvest, inkfund, inkflow, inkstash, inktake, inkworth, inkledger, inkbase,
inkbooks, inkdesk, inkbook, blackbook, chairbook, inkmint, inkvault, inkwise.
Next: Scott picks; then USPTO + Instagram handle check; buy on Cloudflare; flip hosts.


## Session mechanics

- Web admin: Scott's cookie is on **127.0.0.1:3002**. Dev server was running 9/2.
- Auto-mode classifier blocks: `vercel dns add`, Supabase config PATCH, Twilio
  delete/create, anything reading ~/.zshrc. Scott shift+tabs or runs with `!`.
  `SUPABASE_ACCESS_TOKEN` IS in the Bash shell env (scripts can use it).
- Deploy: push auto-deploys; `npx vercel deploy --prod --yes` when in a hurry.
- Chrome MCP tabs open in their own grouped window; Scott may not see them.
