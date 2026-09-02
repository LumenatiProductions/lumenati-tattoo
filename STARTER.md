# NEXT SESSION — Lumenati (updated 2026-09-02, end of day)

## Where things stand

- **lumenatitattoo.com is live on Vercel.** DNS on Vercel nameservers, registration
  still at Squarespace. Google mail, SPF, DKIM, DMARC carried over. Zero Squarespace
  CDN dependency left; the Squarespace SITE subscription can be cancelled (keep the
  domain registration there).
- **Coming-soon cover is ON** (`SITE_COMING_SOON=true` on Vercel). Covers the Y2K
  pages; /request, /privacy, /terms, /admin, /shops, /kiosk etc. stay live. Bypass:
  any page with `?preview=1` (30-day cookie). Lift it: remove the env var, redeploy.
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
- **Rooms: MTV pick 9/2 pm.** `room_content.tv_video_id` = a lineup id. Renders an
  MTV desktop icon + Windows Media Player window, and the site-wide Winamp lists it
  as the last track (play opens the window). Pickers: admin Room page (Vibe) + app
  My Page (search, fed by `/api/tv-channels`). JD's room has Nirvana set as a demo.

## Priority 1: the platform needs its own name + domain (Scott's call)

Scott, end of 9/2: the platform must be a SEPARATE brand from Lumenati Tattoo, on a
NEW domain bought on Cloudflare. NOT lumenati.com (his live company site + mail), NOT
lumenatiapp.com (other Squarespace login, on registrar hold), NOT lumenati.io (owner
unknown, registrant redacted). Naming was paused 7/28 ("names taken"); it's back.
Code is ready: middleware has APP_HOSTS/APP_HOST/SHOP_HOST constants (currently
lumenatiapp.com placeholders) and `PLATFORM_HOST_LIVE` gate. Once a name + domain
exist: add to Vercel project, DNS at Cloudflare (CNAME/A to Vercel), swap the
constants, set `NEXT_PUBLIC_APP_URL`, flip `PLATFORM_HOST_LIVE=true`, redeploy.
Availability checked 9/2: shopfloor.ink and boothos.com free; stencil/booth/chair/
desk/needle/flash .ink all taken.

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

## Then

- Design pass across the Y2K site (crew cards now DB-driven; homepage photo for
  shorty/kalypso/sam/moonie changed to their room profile photo) and the /shops
  marketing page.
- app-native still has vercel.app fallbacks (harmless); swap on next OTA.
- lum-021 still waiting on Grok.

## Session mechanics

- Web admin: Scott's cookie is on **127.0.0.1:3002**. Dev server was running 9/2.
- Auto-mode classifier blocks: `vercel dns add`, Supabase config PATCH, Twilio
  delete/create, anything reading ~/.zshrc. Scott shift+tabs or runs with `!`.
  `SUPABASE_ACCESS_TOKEN` IS in the Bash shell env (scripts can use it).
- Deploy: push auto-deploys; `npx vercel deploy --prod --yes` when in a hurry.
- Chrome MCP tabs open in their own grouped window; Scott may not see them.
