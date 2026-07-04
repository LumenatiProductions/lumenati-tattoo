#!/usr/bin/env node
// ONE-TIME full historical backfill of Square payments into `sales`, then into
// the canonical ledger. The normal sync only looks back 31 days on first run, so
// years of history never came across. This pulls everything from BEGIN and
// upserts it. Idempotent (upsert on sales.id; ledger sync is ON CONFLICT DO
// NOTHING), so safe to re-run. Uses the service-role key.
//
// Run: node scripts/square-full-backfill.mjs [--commit]
// Without --commit it's a DRY RUN: pulls + parses + reports, writes nothing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const COMMIT = process.argv.includes("--commit");
const BEGIN = "2021-01-01T00:00:00Z";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "").replace(/\\n$/, "").trim()];
    }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = env.SQUARE_ACCESS_TOKEN;
const VERSION = env.SQUARE_VERSION || "2025-04-16";
if (!URL || !KEY || !TOKEN) { console.error("Missing env"); process.exit(2); }
const SB = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const SQ = { Authorization: `Bearer ${TOKEN}`, "Square-Version": VERSION, "Content-Type": "application/json" };

// Parse a Square payment the SAME way lib/square/client.ts does.
function toSale(p) {
  const total = p.total_money?.amount ?? p.amount_money?.amount ?? 0;
  const tip = p.tip_money?.amount ?? 0;
  const tax = p.tax_money?.amount ?? 0;
  return {
    id: p.id,
    created_at: p.created_at,
    service_cents: Math.max(0, total - tip - tax),
    tip_cents: tip,
    method: p.card_details ? "card" : p.cash_details ? "cash" : "other",
    team_member_id: p.team_member_id || p.employee_id || null,
    location_id: p.location_id || null,
    status: p.status,
  };
}

console.log(`\nSquare full backfill — ${COMMIT ? "COMMIT (writing)" : "DRY RUN (no writes)"} — since ${BEGIN}\n`);

// Current team -> artist map (preserve existing mappings).
const mapRes = await fetch(`${URL}/rest/v1/square_team_members?select=square_id,artist_id`, { headers: SB });
const memberToArtist = new Map((await mapRes.json()).map((r) => [r.square_id, r.artist_id]));

// Pull every payment, keep COMPLETED.
let cursor, pulled = 0, completed = 0;
const rows = [];
do {
  const p = new URLSearchParams({ begin_time: BEGIN, sort_order: "ASC", limit: "100" });
  if (cursor) p.set("cursor", cursor);
  const r = await fetch(`https://connect.squareup.com/v2/payments?${p}`, { headers: SQ });
  const b = await r.json();
  if (b.errors) { console.error("Square error:", JSON.stringify(b.errors)); process.exit(1); }
  for (const pay of b.payments || []) {
    pulled++;
    if (pay.status !== "COMPLETED") continue;
    completed++;
    const s = toSale(pay);
    s.artist_id = s.team_member_id ? memberToArtist.get(s.team_member_id) ?? null : null;
    s.synced_at = new Date().toISOString();
    rows.push(s);
  }
  cursor = b.cursor;
} while (cursor);

const withArtist = rows.filter((r) => r.artist_id).length;
const gross = rows.reduce((a, r) => a + r.service_cents + r.tip_cents, 0);
console.log(`Pulled ${pulled} payments; ${completed} COMPLETED -> ${rows.length} sales rows`);
console.log(`  attributed to an artist now: ${withArtist} (${rows.length - withArtist} await team->artist mapping)`);
console.log(`  gross (service + tip): $${(gross / 100).toLocaleString()}`);

if (!COMMIT) {
  console.log(`\nDRY RUN complete. Re-run with --commit to write.\n`);
  process.exit(0);
}

// Upsert sales in batches.
let written = 0;
for (let i = 0; i < rows.length; i += 200) {
  const batch = rows.slice(i, i + 200);
  const r = await fetch(`${URL}/rest/v1/sales?on_conflict=id`, {
    method: "POST",
    headers: { ...SB, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
  if (!r.ok) { console.error(`Batch ${i} failed: ${r.status} ${await r.text()}`); process.exit(1); }
  written += batch.length;
  process.stdout.write(`\r  upserted ${written}/${rows.length} sales`);
}
console.log("");

// Mirror into the ledger (idempotent).
const rpc = await fetch(`${URL}/rest/v1/rpc/sync_sales_to_ledger`, { method: "POST", headers: SB });
console.log(`  ledger sync: ${rpc.ok ? "ok" : "FAILED " + rpc.status + " " + (await rpc.text())}`);

console.log(`\nBackfill committed: ${written} sales rows in the platform + ledger.\n`);
