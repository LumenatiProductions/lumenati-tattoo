#!/usr/bin/env node
// Dress the App Review demo tenant as the PERFECT account for marketing
// shots: real session titles instead of "Demo session", a full book of
// completed hours so the hourly rate reads like a working artist (~$180/hr,
// not $4,195/hr), a busy today + a booked week ahead, booth rent configured
// and paid up with an on-time streak, and logged deductions so the tax
// screens read lived-in. Demo shop ONLY. Idempotent: everything this script
// creates is tagged demo-perfect and swept before re-inserting.
//
// Run: node scripts/seed-perfect-demo.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: shop } = await db.from("shops").select("id").eq("slug", "apple-review").maybeSingle();
if (!shop) {
  console.error("apple-review shop not found");
  process.exit(2);
}
const SHOP = shop.id;
const SAM = "apple-review--sam-rivera";
const MAX = "apple-review--max-doyle";
const SAM_EMAIL = "sam.rivera@apple-review.demo";
const TAG = "demo-perfect";

// Deterministic randomness so re-runs lay down the same book.
let seedN = 7;
const rand = () => ((seedN = (seedN * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ── Clients: a real-sounding roster.
const CLIENT_NAMES = [
  ["Riley", "Fox"], ["Jordan", "Lee"], ["Casey", "Nguyen"], ["Maya", "Torres"],
  ["Dev", "Patel"], ["Sofia", "Reyes"], ["Jake", "Muller"], ["Aaliyah", "Brown"],
  ["Chris", "Ortega"], ["Nina", "Kowalski"], ["Marcus", "Hale"], ["Tess", "Nakamura"],
];
const clientIds = [];
for (const [first, last] of CLIENT_NAMES) {
  const { data: existing } = await db
    .from("clients").select("id").eq("shop_id", SHOP).eq("first_name", first).eq("last_name", last).maybeSingle();
  if (existing) {
    clientIds.push(existing.id);
  } else {
    const { data: made, error } = await db
      .from("clients")
      .insert({ id: randomUUID(), shop_id: SHOP, first_name: first, last_name: last, source: "manual", notes: TAG })
      .select("id").single();
    if (error) throw new Error("client: " + error.message);
    clientIds.push(made.id);
  }
}

// ── Session titles that read like a real book.
const SESSIONS = [
  "Half-sleeve, session 2", "Neo-trad rose", "Fine-line script", "Blackwork forearm",
  "Cover-up, session 1", "Flash piece", "Ornamental back piece, session 3", "Micro florals",
  "Dragon rework", "Color pack-in, session 2", "American trad panther", "Healed touch-up",
  "Snake and peony, session 1", "Sternum ornamental", "Script rework",
];

// Sweep prior perfect-demo bookings, then retitle any stray "Demo session".
await db.from("bookings").delete().eq("shop_id", SHOP).eq("notes", TAG);
const { data: stale } = await db.from("bookings").select("id").eq("shop_id", SHOP).eq("service_desc", "Demo session");
for (const b of stale ?? []) {
  await db.from("bookings").update({ service_desc: pick(SESSIONS) }).eq("id", b.id);
}

// Local shop time (America/Denver ≈ UTC-6 in August).
const TZ_OFFSET_H = 6;
const localToUtcIso = (y, m, d, hh, mm = 0) => new Date(Date.UTC(y, m - 1, d, hh + TZ_OFFSET_H, mm)).toISOString();

const now = new Date();
const denNow = new Date(now.getTime() - TZ_OFFSET_H * 3600000);
const Y = denNow.getUTCFullYear();
const M = denNow.getUTCMonth() + 1;
const TODAY = denNow.getUTCDate();
const HOUR_NOW = denNow.getUTCHours() + denNow.getUTCMinutes() / 60;

// ── Sam's completed month: sessions that add up to a believable hourly.
// Target ≈ service ÷ 180/hr; spread over the days worked so far.
const { data: led } = await db
  .from("ledger").select("amount_cents").eq("shop_id", SHOP).eq("artist_id", SAM)
  .eq("kind", "sale").gte("occurred_at", `${Y}-${String(M).padStart(2, "0")}-01`);
const serviceCents = (led ?? []).reduce((a, r) => a + r.amount_cents, 0);
const targetHours = Math.max(10, Math.round(serviceCents / 18000));
console.log(`Sam service this month $${(serviceCents / 100).toFixed(0)} -> ${targetHours} booked hrs (~$180/hr)`);

const rows = [];
let hoursLeft = targetHours;
let ci = 0;
const daysSoFar = [];
for (let d = 1; d <= TODAY; d++) {
  const dow = new Date(Date.UTC(Y, M - 1, d)).getUTCDay();
  if (dow === 1) continue; // shop dark on Mondays
  daysSoFar.push(d);
}
for (let i = 0; i < daysSoFar.length; i++) {
  const d = daysSoFar[i];
  const isToday = d === TODAY;
  const daysRemaining = daysSoFar.length - i;
  const budget = Math.max(2, Math.min(9, Math.round(hoursLeft / daysRemaining)));
  let start = 10;
  let used = 0;
  for (let s = 0; s < 4 && used < budget; s++) {
    const len = Math.min(budget - used, [2, 2.5, 3, 3.5][Math.floor(rand() * 4)]);
    if (len < 1.5) break;
    // Today: only sessions already finished count as completed.
    if (isToday && start + len > HOUR_NOW - 0.25) break;
    rows.push({
      id: randomUUID(),
      shop_id: SHOP,
      artist_id: SAM,
      client_id: clientIds[ci++ % clientIds.length],
      starts_at: localToUtcIso(Y, M, d, Math.floor(start), (start % 1) * 60),
      ends_at: localToUtcIso(Y, M, d, Math.floor(start + len), ((start + len) % 1) * 60),
      status: "completed",
      service_desc: pick(SESSIONS),
      est_price_cents: Math.round(len * 18000),
      deposit_cents: 0,
      deposit_status: "none",
      source: "manual",
      notes: TAG,
    });
    used += len;
    start += len + 0.5;
  }
  hoursLeft -= used;
}

// ── Today's remaining book: one client in the chair soon, one this evening.
const nextStart = Math.max(Math.ceil((HOUR_NOW + 0.75) * 2) / 2, 12);
if (nextStart < 19) {
  rows.push({
    id: randomUUID(),
    shop_id: SHOP, artist_id: SAM, client_id: clientIds[0],
    starts_at: localToUtcIso(Y, M, TODAY, Math.floor(nextStart), (nextStart % 1) * 60),
    ends_at: localToUtcIso(Y, M, TODAY, Math.floor(nextStart + 3), ((nextStart + 3) % 1) * 60),
    status: "scheduled", service_desc: "Half-sleeve, session 2",
    est_price_cents: 54000, deposit_cents: 10000, deposit_status: "held",
    source: "manual", notes: TAG,
  });
}

// ── The week ahead: a full book, deposits held.
for (let d = TODAY + 1; d <= Math.min(TODAY + 7, 28); d++) {
  const dow = new Date(Date.UTC(Y, M - 1, d)).getUTCDay();
  if (dow === 1) continue;
  let start = 11;
  const count = 2 + Math.floor(rand() * 2);
  for (let s = 0; s < count; s++) {
    const len = [2, 2.5, 3][Math.floor(rand() * 3)];
    const artist = rand() > 0.4 ? SAM : MAX;
    rows.push({
      id: randomUUID(),
      shop_id: SHOP, artist_id: artist, client_id: clientIds[ci++ % clientIds.length],
      starts_at: localToUtcIso(Y, M, d, Math.floor(start), (start % 1) * 60),
      ends_at: localToUtcIso(Y, M, d, Math.floor(start + len), ((start + len) % 1) * 60),
      status: "scheduled", service_desc: pick(SESSIONS),
      est_price_cents: Math.round(len * 18000),
      deposit_cents: rand() > 0.4 ? 10000 : 0,
      deposit_status: rand() > 0.4 ? "held" : "none",
      source: "manual", notes: TAG,
    });
    start += len + 0.5;
  }
}

const { error: bErr } = await db.from("bookings").insert(rows);
if (bErr) throw new Error("bookings: " + bErr.message);
console.log(`bookings: ${rows.length} inserted (completed month + today + week ahead)`);

// ── Booth rent: $1,000/mo, paid up, three months on time.
await db.from("artists").update({ rent_cents: 100000 }).eq("id", SAM);
await db.from("rent_invoices").delete().eq("shop_id", SHOP).eq("artist_id", SAM);
const months = [
  { period: `${Y}-${String(M - 2).padStart(2, "0")}`, d: M - 2 },
  { period: `${Y}-${String(M - 1).padStart(2, "0")}`, d: M - 1 },
  { period: `${Y}-${String(M).padStart(2, "0")}`, d: M },
];
for (const m of months) {
  const due = `${Y}-${String(m.d).padStart(2, "0")}-01`;
  const { error } = await db.from("rent_invoices").insert({
    shop_id: SHOP, artist_id: SAM, period: m.period, amount_cents: 100000,
    due_date: due, status: "paid", paid_at: `${due}T16:00:00Z`,
  });
  if (error) throw new Error("rent: " + error.message);
}
console.log("rent: $1,000/mo, 3 months paid on due day");

// ── Deductions: a working artist's YTD supply spend.
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const sam = users.users.find((u) => u.email === SAM_EMAIL);
if (sam) {
  await db.from("artist_expenses").delete().eq("user_id", sam.id);
  const EXP = [
    { m: 1, category: "Supplies", vendor: "Kingpin Tattoo Supply", amount: 41250, note: "Cartridges + grips" },
    { m: 2, category: "Supplies", vendor: "World Famous Ink", amount: 28600, note: "Ink restock" },
    { m: 3, category: "Equipment", vendor: "FK Irons", amount: 64900, note: "Backup machine" },
    { m: 4, category: "Education", vendor: "Ink Masters Expo", amount: 35000, note: "Convention booth + classes" },
    { m: 5, category: "Supplies", vendor: "Saniderm", amount: 18900, note: "Aftercare wrap" },
    { m: 6, category: "Supplies", vendor: "Kingpin Tattoo Supply", amount: 32750, note: "Needles + barriers" },
    { m: 7, category: "Marketing", vendor: "Moo", amount: 12400, note: "Business cards" },
    { m: 8, category: "Supplies", vendor: "World Famous Ink", amount: 24300, note: "Color set" },
  ].filter((e) => e.m <= M);
  const { error } = await db.from("artist_expenses").insert(
    // shop_id explicit: the stamping trigger falls back to the Lumenati shop
    // for the service role, which would hide the rows from Sam's RLS.
    EXP.map((e) => ({
      user_id: sam.id,
      shop_id: SHOP,
      date: `${Y}-${String(e.m).padStart(2, "0")}-${String(3 + Math.floor(rand() * 20)).padStart(2, "0")}`,
      category: e.category, vendor: e.vendor, amount_cents: e.amount, note: e.note,
    })),
  );
  if (error) throw new Error("expenses: " + error.message);
  console.log(`deductions: ${EXP.length} logged ($${(EXP.reduce((a, e) => a + e.amount, 0) / 100).toFixed(0)} YTD)`);
} else {
  console.log("deductions skipped: Sam auth user not found");
}

console.log("perfect demo dressed");
