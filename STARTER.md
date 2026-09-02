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
