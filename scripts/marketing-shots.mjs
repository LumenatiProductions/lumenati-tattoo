#!/usr/bin/env node
// Capture real product screenshots for the /shops marketing page from the
// App Review demo tenant (never Lumenati's real data). Signs in headlessly
// with the documented test OTP (+1 500 555 0100 / 000000), then shoots the
// Command Center at desktop and phone widths into public/marketing/.
//
// Run (dev server must be on :3002): node scripts/marketing-shots.mjs
// Re-run any time the demo data improves; images overwrite in place.

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Playwright lives in the cinebody monorepo; borrow it rather than adding a
// heavy dev dependency here.
const require = createRequire("/Users/scottmcdonald/cinebody-platform/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/package.json");
const { chromium } = require("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "marketing");
mkdirSync(OUT, { recursive: true });

const BASE = "http://127.0.0.1:3002";
async function signIn(page) {
  await page.goto(`${BASE}/admin/login`);
  await page.getByPlaceholder("(555) 555-5555").fill("(500) 555-0100");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await page.getByPlaceholder("000000").fill("000000");
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.waitForURL("**/admin", { timeout: 20000 });
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  // Hide (never remove — React owns these nodes) the bug reporter and the
  // Next.js dev-tools bubble so shots are clean.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll("button").forEach((b) => {
      const t = b.textContent || "";
      // Square is historical only — it has no place in marketing shots.
      if (t.includes("Report a bug") || t.includes("Sync from Square")) b.style.display = "none";
    });
  });
}

const shot = (page, name) => page.screenshot({ path: join(OUT, name), type: "png" });

const browser = await chromium.launch();

// Desktop: 1440 wide at 2x for crisp marketing crops.
const desktop = await browser.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
const page = await desktop.newPage();
// The first-run setup card is real product but clutters a money shot; the
// demo shop id is stable (provision script re-creates it idempotently).
await page.addInitScript(() => {
  try {
    localStorage.setItem("lum-setup-hidden-f1b59afa-4406-45c5-8133-9630f3e75095", "1");
  } catch {}
});
await signIn(page);

// Punched-in content crops for the SHOP slider: drop the sidebar and frame
// each page's key panels. Anchored on the page's h1 so the sidebar is out.
const clipContent = async (name, height = 600) => {
  await settle(page);
  const box = await page.locator("h1").first().boundingBox();
  const vw = page.viewportSize().width;
  const x = Math.max(0, Math.round((box?.x ?? 320) - 28));
  const y = Math.max(0, Math.round((box?.y ?? 40) - 22));
  await page.screenshot({ path: join(OUT, `${name}.png`), clip: { x, y, width: vw - x - 24, height } });
  console.log(`${name}.png`);
};

// Wait for live sales + the coach to load so the overview reads full (not the
// empty first-paint state) in both the hero laptop and the slider crop.
await page.getByText("Live", { exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
await page.getByText("reads from your own numbers", { exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
await page.getByText("appointments today", { exact: false }).waitFor({ timeout: 12000 }).catch(() => {});
await page.waitForTimeout(1800);
// Full overview (with sidebar) for the hero laptop; punched-in crop for the slider.
await settle(page); // hides the bug-reporter + Square buttons
await shot(page, "command-center-full.png");
console.log("command-center-full.png");
await clipContent("command-center");

for (const route of ["/admin/reports", "/admin/bookings", "/admin/payouts", "/admin/followups"]) {
  await page.goto(`${BASE}${route}`);
  await clipContent(route.split("/").pop());
}

// One OTP sign-in per run: later contexts reuse this session (the test OTP
// rate-limits repeat sends, so a second signIn() times out).
const state = await desktop.storageState();
await desktop.close();

// Phone: the Command Center from a pocket (390pt at 3x).
const phone = await browser.newContext({
  viewport: { width: 390, height: 780 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  storageState: state,
});
const ppage = await phone.newPage();
await ppage.addInitScript(() => {
  try {
    localStorage.setItem("lum-setup-hidden-f1b59afa-4406-45c5-8133-9630f3e75095", "1");
  } catch {}
});
await ppage.goto(`${BASE}/admin`);
await settle(ppage);
await shot(ppage, "pocket.png");
console.log("pocket.png");
await phone.close();

// ── Zoomed feature highlights ─────────────────────────────────────────────
// Element-level captures of the best moments, for the close-up cards on
// /shops. Text-anchored locators; .last() picks the innermost match.
const hi = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: state });
const hp = await hi.newPage();
await hp.addInitScript(() => {
  try {
    localStorage.setItem("lum-setup-hidden-f1b59afa-4406-45c5-8133-9630f3e75095", "1");
  } catch {}
});
await hp.goto(`${BASE}/admin`);

async function elShot(pg, locator, name) {
  try {
    const el = locator.last();
    await el.waitFor({ state: "visible", timeout: 8000 });
    await el.screenshot({ path: join(OUT, name) });
    console.log(name);
  } catch (e) {
    console.log(`SKIP ${name}: ${e.message.split("\n")[0]}`);
  }
}

await settle(hp);
await elShot(hp, hp.locator("div.rounded-xl", { hasText: "Saturdays run at" }), "hi-coach.png");

await hp.goto(`${BASE}/admin/bookings`);
await settle(hp);
await elShot(hp, hp.locator("div.rounded-xl", { hasText: "No-show" }).filter({ hasText: "Jordan" }), "hi-booking.png");

await hp.goto(`${BASE}/admin/followups`);
await settle(hp);
await elShot(hp, hp.locator("div.rounded-xl", { hasText: "Aftercare" }).filter({ hasText: "Jordan" }), "hi-followups.png");

await hp.goto(`${BASE}/admin/room`);
await settle(hp);
await elShot(hp, hp.locator("div.lg\\:sticky"), "hi-preview.png");

// Signed-out surfaces: the login card and the flash claim tile.
const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const ap = await anon.newPage();
await ap.goto(`${BASE}/admin/login`);
await settle(ap);
await elShot(ap, ap.locator("div", { hasText: "Team sign-in" }).locator("xpath=self::div[contains(@class,'rounded')]").first(), "hi-signin.png");

const aphone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: state });
const fp = await aphone.newPage();
await fp.goto(`${BASE}/s/apple-review/sam-rivera?skin=flash`);
await settle(fp);
await elShot(fp, fp.locator(".flash-claim").first().locator("xpath=ancestor::a[1]"), "hi-flash.png");
await elShot(fp, fp.locator(".flash-stamp").first().locator("xpath=ancestor::a[1]"), "hi-claimed.png");

// Phone shots for the phones strip.
const p2 = await aphone.newPage();
await p2.addInitScript(() => {
  try {
    localStorage.setItem("lum-setup-hidden-f1b59afa-4406-45c5-8133-9630f3e75095", "1");
  } catch {}
});
await p2.goto(`${BASE}/admin/bookings`);
await settle(p2);
await shot(p2, "phone-bookings.png");
console.log("phone-bookings.png");

await hi.close();
await anon.close();
await aphone.close();

await browser.close();
console.log(`done -> ${OUT}`);
