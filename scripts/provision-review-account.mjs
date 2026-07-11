#!/usr/bin/env node
// One-shot: provision the App Review demo tenant. Creates a sandbox shop
// ("Apple Review Studio"), two artists with page content, a handful of demo
// clients/bookings so the app looks alive, and the reviewer's login:
//   phone +1 (500) 555-0100 / email applereview@lumenati.app, role owner
//   (owner of the DEMO shop only — sees every feature, zero real data).
//
// BEFORE App Review: in Supabase Dashboard -> Auth -> Providers -> Phone,
// add a Test OTP for +15005550100 (code 000000). The reviewer signs in with
// that number and the fixed code — no SMS is ever sent.
//
// Run (Scott's go only — writes to prod): node scripts/provision-review-account.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const REVIEW_EMAIL = "applereview@lumenati.app";
const REVIEW_PHONE = "+15005550100";
const SHOP_SLUG = "apple-review";

const { data: existing } = await db.from("shops").select("id").eq("slug", SHOP_SLUG).maybeSingle();
if (existing) {
  console.log("Demo shop already exists — nothing to do. Shop id:", existing.id);
  process.exit(0);
}

const shopId = randomUUID();
let err;
({ error: err } = await db.from("shops").insert({
  id: shopId,
  slug: SHOP_SLUG,
  name: "Apple Review Studio",
  template: "standard",
  accent: "#22d3ee",
  tagline: "Demo shop for App Review",
}));
if (err) throw new Error("shops: " + err.message);

const ARTISTS = [
  { name: "Sam Rivera", color: "#22d3ee" },
  { name: "Max Doyle", color: "#f59e0b" },
];
const artistIds = [];
for (let i = 0; i < ARTISTS.length; i++) {
  const a = ARTISTS[i];
  const id = `${SHOP_SLUG}--${a.name.toLowerCase().replace(/\s+/g, "-")}`;
  artistIds.push(id);
  ({ error: err } = await db.from("artists").insert({
    id, slug: id, name: a.name, handle: "", color: a.color, active: true, sort: i, shop_id: shopId,
  }));
  if (err) throw new Error("artists: " + err.message);
  ({ error: err } = await db.from("room_content").insert({
    artist_id: id, accent_color: a.color, shop_id: shopId,
    tagline: "Custom work, walk-ins welcome", bio: "Demo artist for App Review.",
  }));
  if (err) throw new Error("room_content: " + err.message);
}

// A few clients + bookings so screens aren't empty for the reviewer.
const now = Date.now();
const CLIENTS = [
  { first_name: "Jordan", last_name: "Lee" },
  { first_name: "Casey", last_name: "Nguyen" },
  { first_name: "Riley", last_name: "Fox" },
];
const clientIds = [];
for (const c of CLIENTS) {
  const id = randomUUID();
  clientIds.push(id);
  ({ error: err } = await db.from("clients").insert({ id, ...c, shop_id: shopId }));
  if (err) throw new Error("clients: " + err.message);
}
for (let i = 0; i < 4; i++) {
  ({ error: err } = await db.from("bookings").insert({
    id: randomUUID(),
    shop_id: shopId,
    artist_id: artistIds[i % 2],
    client_id: clientIds[i % 3],
    status: i === 0 ? "completed" : "scheduled",
    starts_at: new Date(now + (i - 1) * 86_400_000).toISOString(),
    ends_at: new Date(now + (i - 1) * 86_400_000 + 2 * 3_600_000).toISOString(),
    service_desc: "Demo session",
  }));
  if (err) throw new Error("bookings: " + err.message);
}

// The reviewer's login: auth user (phone + email, both confirmed) + profile.
const { data: created, error: authErr } = await db.auth.admin.createUser({
  email: REVIEW_EMAIL,
  phone: REVIEW_PHONE,
  email_confirm: true,
  phone_confirm: true,
});
if (authErr) throw new Error("auth user: " + authErr.message);
({ error: err } = await db.from("profiles").insert({
  email: REVIEW_EMAIL,
  phone: REVIEW_PHONE,
  role: "owner",
  full_name: "App Reviewer",
  shop_id: shopId,
}));
if (err) throw new Error("profiles: " + err.message);

console.log("Demo tenant ready.");
console.log("  shop:", shopId, `(/s/${SHOP_SLUG})`);
console.log("  reviewer:", REVIEW_EMAIL, REVIEW_PHONE, "auth id:", created.user.id);
console.log("REMINDER: add Test OTP for", REVIEW_PHONE, "(code 000000) in Supabase Auth -> Phone.");
