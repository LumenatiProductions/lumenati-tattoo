#!/usr/bin/env node
// Capture the artist home screen at its FULL scroll height as one tall
// image, for the /shops scroll-takeover demo (the takeover scrolls this
// exact capture, so what visitors "scroll" is the real app, pixel for
// pixel). Same Sam Rivera session recipe as marketing-shots-artist.mjs.
//
// Run (Metro on :8081): node scripts/marketing-shots-artist-tall.mjs

import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire("/Users/scottmcdonald/cinebody-platform/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/package.json");
const { chromium } = require("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "marketing");
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const appEnv = Object.fromEntries(
  readFileSync(join(root, "app-native", ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA_URL).hostname.split(".")[0];
const admin = createClient(SUPA_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SHOP = "f1b59afa-4406-45c5-8133-9630f3e75095";
const ARTIST_ID = "apple-review--sam-rivera";
const EMAIL = "sam.rivera@apple-review.demo";
const PASSWORD = "DemoArtist!2026";

// Sam already exists from the sibling script's runs; just refresh the login.
const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
let user = list.users.find((u) => u.email === EMAIL);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  user = data.user;
} else {
  await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
}
await admin.from("profiles").upsert(
  { email: EMAIL, role: "artist", artist_id: ARTIST_ID, shop_id: SHOP, full_name: "Sam Rivera" },
  { onConflict: "email" },
);

const anon = createClient(SUPA_URL, appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signErr) throw new Error("signIn: " + signErr.message);
const session = signIn.session;
console.log("session for", EMAIL);

const APP = "http://localhost:8081";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const key = `sb-${REF}-auth-token`;
await page.addInitScript(
  ([k, s]) => {
    try {
      localStorage.setItem(k, JSON.stringify(s));
    } catch {}
  },
  [key, session],
);

await page.goto(APP, { timeout: 180000 });
await page.waitForTimeout(12000);
if (await page.getByPlaceholder("(555) 555-5555").count()) {
  throw new Error("session injection failed — still on sign-in");
}
try {
  await page.getByText("This month", { exact: true }).first().click({ timeout: 5000, force: true });
  await page.waitForTimeout(1500);
} catch {
  console.log("  (month toggle not tapped)");
}
await page.mouse.wheel(0, -6000);
await page.waitForTimeout(1200);

// Hide the floating bug-report chrome.
await page.evaluate(() => {
  const hit = [...document.querySelectorAll("div")].find((d) => (d.textContent || "").trim() === "Report a bug");
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

// How tall is the whole scroll, and which element scrolls?
const info = await page.evaluate(() => {
  const doc = document.scrollingElement || document.documentElement;
  let el = doc;
  let max = doc.scrollHeight;
  for (const d of document.querySelectorAll("div")) {
    if (d.scrollHeight > d.clientHeight + 50 && d.scrollHeight > max) {
      max = d.scrollHeight;
      el = d;
    }
  }
  el.setAttribute("data-tall-capture", "1");
  return { scrollHeight: max, isDoc: el === doc, clientHeight: el.clientHeight };
});
console.log("scroll container:", info);

// Grow the viewport to the full scroll height so nothing is clipped, then
// shoot the scroll container in one frame.
const H = Math.min(info.scrollHeight + 40, 8000);
await page.setViewportSize({ width: 390, height: H });
await page.waitForTimeout(2500);
if (info.isDoc) {
  await page.screenshot({ path: join(OUT, "app-artist-scroll.png"), type: "png", fullPage: true });
} else {
  const el = page.locator('[data-tall-capture="1"]');
  await el.screenshot({ path: join(OUT, "app-artist-scroll.png"), type: "png" });
}
console.log("app-artist-scroll.png at height", H);

await browser.close();
console.log("done");
