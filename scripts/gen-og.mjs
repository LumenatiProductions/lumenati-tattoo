#!/usr/bin/env node
// Generate the /shops social share image (Open Graph, 1200x630) — the card
// that unfurls when the link is dropped in iMessage, socials, etc. Renders a
// branded card with the app's ink look via Playwright (dev server on :3002),
// then writes public/marketing/og-shops.png.
//
// Run (dev server on :3002): node scripts/gen-og.mjs

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire("/Users/scottmcdonald/cinebody-platform/package.json");
const { chromium } = require("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "marketing");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3002";
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #f2f3fa;
    background:
      radial-gradient(46% 62% at 6% 0%, rgba(124,58,190,0.52), transparent 60%),
      radial-gradient(42% 60% at 100% 8%, rgba(255,20,147,0.3), transparent 60%),
      radial-gradient(52% 72% at 96% 100%, rgba(0,150,210,0.26), transparent 60%),
      radial-gradient(60% 70% at 40% 55%, rgba(78,48,150,0.18), transparent 72%),
      #08080e; }
  .logo { position: absolute; top: 58px; left: 66px; width: 128px; }
  .copy { position: absolute; left: 66px; top: 214px; max-width: 640px; }
  .eyebrow { color: #ff1493; font-weight: 800; letter-spacing: 0.26em;
    font-size: 18px; text-transform: uppercase; }
  h1 { font-size: 82px; font-weight: 900; line-height: 1.0; margin-top: 22px; letter-spacing: -0.01em; }
  h1 .pink { color: #ff1493; }
  .sub { font-size: 27px; color: #c9c9d6; margin-top: 26px; max-width: 560px; line-height: 1.42; }
  .phone { position: absolute; right: 78px; top: 66px; width: 300px; height: 600px;
    border-radius: 46px; background: #000; padding: 12px;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 30px 80px rgba(0,0,0,0.6), 0 0 90px 10px rgba(255,20,147,0.4); }
  .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 34px; }
</style></head><body>
  <img class="logo" src="${BASE}/brand/lumenati-on-dark.svg" />
  <div class="copy">
    <div class="eyebrow">The business brain for tattoo shops</div>
    <h1>Everything but<br><span class="pink">the tattoo.</span></h1>
    <div class="sub">Coaching, the books, follow-ups, goals &amp; taxes. You bring the needle.</div>
  </div>
  <div class="phone"><img src="${BASE}/marketing/app-artist-home.webp" /></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 }).then((c) => c.newPage());
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, "og-shops.png"), clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log("wrote public/marketing/og-shops.png");
