#!/usr/bin/env node
// Purpose-cut crops for the /shops back-office deck. Each admin page is
// captured full-height, then cropped to EXACTLY the deck card's 16:10 frame:
// sidebar removed, page header skipped, the region that tells the story
// (CROPS below) framed 1:1 so the deck never has to cover-crop.
//
// Run (dev server on :3002): node scripts/marketing-shots-deck.mjs

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire("/Users/scottmcdonald/cinebody-platform/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/package.json");
const { chromium } = require("playwright");
const sharp = require(join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "sharp"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "marketing");
mkdirSync(OUT, { recursive: true });

const BASE = "http://127.0.0.1:3002";
const DPR = 2;
const VIEW_W = 1440;

// Per page: where the story starts (CSS px from the top of the full page).
const CROPS = [
  { path: "/admin", name: "deck-overview", top: 84 },
  { path: "/admin/reports", name: "deck-reports", top: 138 },
  { path: "/admin/payouts", name: "deck-pay", top: 330 },
  { path: "/admin/bookings", name: "deck-bookings", top: 116 },
  { path: "/admin/followups", name: "deck-followups", top: 96 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: VIEW_W, height: 900 },
  deviceScaleFactor: DPR,
});
const page = await ctx.newPage();

await page.goto(`${BASE}/admin/login`);
await page.getByPlaceholder("(555) 555-5555").fill("(500) 555-0100");
await page.getByRole("button", { name: "Text me a code" }).click();
await page.getByPlaceholder("000000").fill("000000");
await page.getByRole("button", { name: "Verify & sign in" }).click();
await page.waitForURL("**/admin", { timeout: 30000 });

const settle = async () => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll("button").forEach((b) => {
      const t = b.textContent || "";
      if (t.includes("Report a bug") || t.includes("Sync from Square")) b.style.display = "none";
    });
  });
  // The Get-set-up card is for real new owners, not marketing shots.
  try {
    await page.getByText("Hide", { exact: true }).first().click({ timeout: 2500 });
  } catch {}
  await page.waitForTimeout(1100);
};

for (const c of CROPS) {
  await page.goto(`${BASE}${c.path}`);
  await settle();

  // Sidebar width, measured live (collapsed vs open changes it).
  const sideW = await page.evaluate(() => {
    const nav = document.querySelector("aside, nav");
    return nav ? Math.round(nav.getBoundingClientRect().width) : 213;
  });
  const contentW = VIEW_W - sideW;
  const cropH = Math.round((contentW * 10) / 16);

  const buf = await page.screenshot({ fullPage: true, type: "png" });
  const meta = await sharp(buf).metadata();
  const top = Math.min(c.top * DPR, Math.max(0, meta.height - cropH * DPR));
  await sharp(buf)
    .extract({ left: sideW * DPR, top, width: contentW * DPR, height: Math.min(cropH * DPR, meta.height - top) })
    .png()
    .toFile(join(OUT, `${c.name}.png`));
  await sharp(join(OUT, `${c.name}.png`)).webp({ quality: 82 }).toFile(join(OUT, `${c.name}.webp`));
  console.log(`${c.name}.webp (${contentW}x${cropH} from y=${c.top}, sidebar ${sideW})`);
}

await browser.close();
console.log("done");
