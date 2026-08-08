#!/usr/bin/env node
// Record a smooth drive through the Command Center as the demo owner, for
// the /shops scroll-scrubbed video (page scroll drives playback). Signs in
// with the documented test OTP, glides through the money pages, and saves
// public/marketing/command-center-drive.mp4 (dense keyframes so scrubbing
// by scroll is smooth).
//
// Run (dev server on :3002): node scripts/record-admin-drive.mjs

import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire("/Users/scottmcdonald/cinebody-platform/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/package.json");
const { chromium } = require("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "marketing");
const TMP = join(root, ".video-tmp");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const BASE = "http://127.0.0.1:3002";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  recordVideo: { dir: TMP, size: { width: 1440, height: 900 } },
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
  await page.waitForTimeout(900);
};

// Glide: many small wheel ticks so the scroll reads silky on scrub.
const glide = async (px) => {
  const step = 24;
  const n = Math.round(Math.abs(px) / step);
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(0, Math.sign(px) * step);
    await page.waitForTimeout(16);
  }
};

// The tour: overview (the money + coach), then the money pages.
await settle();
// The Get-set-up card is for real new owners, not the tour.
try {
  await page.getByText("Hide", { exact: true }).first().click({ timeout: 3000 });
  await page.waitForTimeout(600);
} catch {}
await page.waitForTimeout(1200);
await glide(1000);
await page.waitForTimeout(700);
await glide(900);
await page.waitForTimeout(900);

for (const path of ["/admin/bookings", "/admin/reports", "/admin/pnl", "/admin/followups"]) {
  await page.goto(`${BASE}${path}`);
  await settle();
  await page.waitForTimeout(600);
  await glide(700);
  await page.waitForTimeout(800);
}

await ctx.close();
await browser.close();

const webm = readdirSync(TMP).find((f) => f.endsWith(".webm"));
if (!webm) throw new Error("no video captured");
const src = join(TMP, webm);
const dst = join(OUT, "command-center-drive.mp4");
// Dense keyframes (-g 12) so scroll scrubbing lands on frames instantly.
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-i", src,
  "-vf", "scale=1280:-2",
  "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-g", "12",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  dst,
]);
rmSync(TMP, { recursive: true, force: true });
execFileSync("ls", ["-la", dst], { stdio: "inherit" });
console.log("done");
