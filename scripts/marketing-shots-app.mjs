#!/usr/bin/env node
// Capture the PHONE APP's money/coaching screens for /shops marketing, via
// Scott's running Metro web (:8081 — reuse, never restart). Signs in as the
// App Review owner (test OTP), shoots the shop revenue dashboard, then taps
// into a chair to preview the artist money home. Demo tenant only.
//
// Run: node scripts/marketing-shots-app.mjs

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire("/Users/scottmcdonald/cinebody-platform/package.json");
const { chromium } = require("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "marketing");
mkdirSync(OUT, { recursive: true });

const APP = "http://localhost:8081";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

// Hide the floating bug reporter (RN-web renders it as a fixed pressable).
// Climb only to the nearest positioned ancestor so we hide the pill, not the
// whole app root.
const hideChrome = () =>
  page.evaluate(() => {
    const hit = [...document.querySelectorAll("div")].find(
      (d) => (d.textContent || "").trim() === "Report a bug",
    );
    if (!hit) return;
    let n = hit;
    for (let i = 0; i < 8 && n && n !== document.body; i++) {
      const pos = getComputedStyle(n).position;
      if (pos === "fixed" || pos === "absolute") {
        n.style.display = "none";
        return;
      }
      n = n.parentElement;
    }
    hit.style.display = "none";
  });

const shot = async (name) => {
  await hideChrome();
  await page.screenshot({ path: join(OUT, name), type: "png" });
  console.log(name);
};

// Switch the money range to This month so the seeded 14 days show full
// numbers (the current calendar week only just started).
const monthRange = async () => {
  try {
    const t = page.getByText("This month", { exact: true }).first();
    await t.click({ timeout: 5000, force: true });
    await page.waitForTimeout(1200);
  } catch {
    console.log("  (month toggle not tapped)");
  }
};

// Metro web can take a while on a cold bundle — be patient.
await page.goto(APP, { timeout: 120000 });
await page.getByPlaceholder("(555) 555-5555").waitFor({ timeout: 120000 });
await page.getByPlaceholder("(555) 555-5555").fill("(500) 555-0100");
await page.getByText("Text me a code", { exact: true }).click();
await page.getByPlaceholder("000000").waitFor({ timeout: 20000 });
await page.getByPlaceholder("000000").fill("000000");
await page.getByText("Verify", { exact: true }).click();

// Owner home = the shop revenue dashboard (race chart, chairs, shop coach).
await page.waitForTimeout(6000);
await monthRange();
await shot("app-shop-home.png");

// Scroll for the shop goal race + chairs leaderboard.
await page.mouse.wheel(0, 900);
await page.waitForTimeout(1000);
await shot("app-shop-mid.png");
await page.mouse.wheel(0, 900);
await page.waitForTimeout(1000);
await shot("app-shop-coach.png");

// Tap a chair -> the artist money home. Sam carries most of the month's
// sales, so the earnings/goal/tax screens read full over the This month range.
await page.mouse.wheel(0, -600); // bring the chairs leaderboard back into view
await page.waitForTimeout(600);
// RN-web Pressables don't take a Playwright click reliably; dispatch the tap
// on the leaderboard row's DOM node directly.
const tapped = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("div")].filter(
    (d) => (d.textContent || "").trim() === "Sam Rivera",
  );
  const el = rows[rows.length - 1];
  if (!el) return false;
  let n = el;
  for (let i = 0; i < 5 && n; i++) {
    n.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    n = n.parentElement;
  }
  return true;
});
if (tapped) {
  await page.waitForTimeout(4000);
  await monthRange();
  await shot("app-artist-home.png");
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1000);
  await shot("app-artist-mid.png");
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1000);
  await shot("app-artist-coach.png");
} else {
  console.log("SKIP artist preview: no chair on screen");
}

await browser.close();
console.log(`done -> ${OUT}`);
