#!/usr/bin/env node
// Capture the artist app screens as a REAL artist (Sam Rivera) logged into
// their own app — no owner "Viewing as" preview banner. Creates Sam a real
// artist login on the demo tenant, moves the demo goals onto it, signs in
// with a password to mint a session, injects that session into Metro web's
// localStorage, and shoots the artist home + goals/tax screens.
//
// Run (Metro on :8081): node scripts/marketing-shots-artist.mjs

import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire("/Users/scottmcdonald/cinebody-platform/package.json");
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

// 1) Ensure Sam has a confirmed auth user with a password.
const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
let user = list.users.find((u) => u.email === EMAIL);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error("createUser: " + error.message);
  user = data.user;
} else {
  await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
}

// 2) Profile: artist on the demo shop, pinned to Sam's chair.
await admin.from("profiles").upsert(
  { email: EMAIL, role: "artist", artist_id: ARTIST_ID, shop_id: SHOP, full_name: "Sam Rivera" },
  { onConflict: "email" },
);
// 3) Goals on Sam's own user (so the goal/tax screens read full when Sam logs in).
await admin.from("artist_goals").upsert(
  {
    user_id: user.id,
    shop_id: SHOP,
    weekly_cents: 350000,
    monthly_cents: Math.round((350000 * 52) / 12),
    tax_setaside_pct: 0.3,
    tax_status: "1099",
    updated_at: new Date().toISOString(),
  },
  { onConflict: "user_id" },
);

// 4) Mint a real session for Sam.
const anon = createClient(SUPA_URL, appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signErr) throw new Error("signIn: " + signErr.message);
const session = signIn.session;
console.log("session for", EMAIL, "expires", session.expires_at);

// 5) Inject into Metro web localStorage and capture.
const APP = "http://localhost:8081";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
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

const hideChrome = () =>
  page.evaluate(() => {
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
const monthRange = async () => {
  try {
    await page.getByText("This month", { exact: true }).first().click({ timeout: 5000, force: true });
    await page.waitForTimeout(1200);
  } catch {
    console.log("  (month toggle not tapped)");
  }
};
const shot = async (name) => {
  await hideChrome();
  await page.screenshot({ path: join(OUT, name), type: "png" });
  console.log(name);
};

await page.goto(APP, { timeout: 120000 });
// Wait until we're past sign-in (the artist home renders "YOUR DAY" / earnings).
await page.waitForTimeout(8000);
if (await page.getByPlaceholder("(555) 555-5555").count()) {
  throw new Error("session injection failed — still on sign-in");
}
await monthRange();
await shot("app-artist-home.png");
await page.mouse.wheel(0, 950);
await page.waitForTimeout(1200);
await shot("app-artist-goals.png");
await page.mouse.wheel(0, 980);
await page.waitForTimeout(1200);
await shot("app-artist-coach.png");

await browser.close();
console.log("done");
