#!/usr/bin/env node
// Seed the App Review demo tenant with two weeks of believable sales so the
// Command Center (and marketing screenshots) read as a living shop, not a
// $0 dashboard. Idempotent: rows ride external_id demo-sale-<n>_svc/_tip and
// upsert on (source, external_id), so re-runs never duplicate. Demo shop
// ONLY — never point this at Lumenati.
//
// Run: node scripts/seed-review-sales.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
  console.error("apple-review shop not found — run provision-review-account.mjs first");
  process.exit(2);
}
const ARTISTS = ["apple-review--sam-rivera", "apple-review--max-doyle"];

// Deterministic pseudo-randomness so re-runs produce the same believable set.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

// 14 days, weekend-heavy (a coach line about quiet Tuesdays should ring true).
const DAY_WEIGHT = [5, 1, 2, 3, 3, 4, 6]; // Sun..Sat
const rows = [];
let n = 0;
const now = new Date();
for (let d = 13; d >= 0; d--) {
  const day = new Date(now.getTime() - d * 86_400_000);
  const count = DAY_WEIGHT[day.getDay()] + (rand() > 0.5 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    n++;
    const artist = ARTISTS[rand() > 0.35 ? 0 : 1];
    const cash = rand() < 0.2;
    const service = (15 + Math.floor(rand() * 40)) * 1000; // $150-$550
    const tip = Math.round(service * (0.15 + rand() * 0.1)); // 15-25%
    const at = new Date(day);
    at.setHours(11 + Math.floor(rand() * 8), Math.floor(rand() * 60), 0, 0);
    const base = {
      shop_id: shop.id,
      occurred_at: at.toISOString(),
      created_by: "demo-seed",
      source: cash ? "cash" : "stripe",
      direction: "in",
      currency: "usd",
      artist_id: artist,
      note: "demo seed",
    };
    rows.push({ ...base, kind: "sale", amount_cents: service, external_id: `demo-sale-${n}_svc` });
    rows.push({ ...base, kind: "tip", amount_cents: tip, external_id: `demo-sale-${n}_tip` });
  }
}

const { error } = await db.from("ledger").upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: true });
if (error) {
  console.error("ledger seed failed:", error.message);
  process.exit(1);
}
const total = rows.filter((r) => r.kind === "sale").reduce((a, r) => a + r.amount_cents, 0);
console.log(`seeded ${n} demo sales ($${(total / 100).toLocaleString()}) across 14 days for apple-review`);
