#!/usr/bin/env node
// Read-only audit of the historical (mostly Square-imported) data, to quantify
// the mess before any cleanup. Uses the service-role key so it sees every row
// (RLS bypassed). Writes NOTHING. Run: node scripts/historical-audit.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
if (!URL || !KEY) { console.error("Missing URL / service role key"); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Exact row count via Content-Range, with an arbitrary PostgREST filter.
async function count(table, filter = "") {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id${filter ? "&" + filter : ""}`, {
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = r.headers.get("content-range") || "*/0";
  return Number(cr.split("/")[1] || 0);
}

// Pull all rows of a few columns, paging past the 1000 cap.
async function pull(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=${cols}`, {
      headers: { ...H, Range: `${from}-${from + 999}` },
    });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const norm = (s) => (s || "").toString().trim().toLowerCase();
const digits = (s) => (s || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); // US 10-digit

console.log("\n================  HISTORICAL DATA AUDIT  ================\n");

// ── CLIENTS ──
const clients = await pull("clients", "id,first_name,last_name,email,phone,source,total_spent_cents,first_seen,last_seen,preferred_artist_id");
console.log(`CLIENTS: ${clients.length} total`);
const bySource = {};
for (const c of clients) bySource[c.source || "?"] = (bySource[c.source || "?"] || 0) + 1;
console.log(`  by source: ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join(", ")}`);

const unnamed = clients.filter((c) => !norm(c.first_name) && !norm(c.last_name));
const noContact = clients.filter((c) => !norm(c.email) && !digits(c.phone));
const noName_noContact = clients.filter((c) => !norm(c.first_name) && !norm(c.last_name) && !norm(c.email) && !digits(c.phone));
console.log(`  unnamed (no first/last): ${unnamed.length}`);
console.log(`  no contact (no email + no phone): ${noContact.length}`);
console.log(`  ghost (no name AND no contact): ${noName_noContact.length}`);

// duplicate groups
function groups(keyFn) {
  const m = new Map();
  for (const c of clients) {
    const k = keyFn(c);
    if (!k) continue;
    (m.get(k) || m.set(k, []).get(k)).push(c);
  }
  return [...m.values()].filter((g) => g.length > 1);
}
const dupPhone = groups((c) => (digits(c.phone).length >= 10 ? "p:" + digits(c.phone) : ""));
const dupEmail = groups((c) => (norm(c.email) ? "e:" + norm(c.email) : ""));
const dupName = groups((c) => {
  const n = `${norm(c.first_name)} ${norm(c.last_name)}`.trim();
  return n && norm(c.first_name) && norm(c.last_name) ? "n:" + n : "";
});
const extra = (gs) => gs.reduce((a, g) => a + g.length - 1, 0);
console.log(`  DUPLICATES:`);
console.log(`    same phone: ${dupPhone.length} groups, ${extra(dupPhone)} extra rows`);
console.log(`    same email: ${dupEmail.length} groups, ${extra(dupEmail)} extra rows`);
console.log(`    same full name: ${dupName.length} groups, ${extra(dupName)} extra rows`);
const noPref = clients.filter((c) => !c.preferred_artist_id).length;
console.log(`  without a preferred artist: ${noPref}`);

// show a few worst dupes
const worst = [...dupPhone, ...dupEmail].sort((a, b) => b.length - a.length).slice(0, 5);
if (worst.length) {
  console.log(`  sample duplicate groups:`);
  for (const g of worst) {
    const key = digits(g[0].phone) || norm(g[0].email);
    console.log(`    • ${key}: ${g.map((c) => `${c.first_name} ${c.last_name}`.trim() || c.id).join(" | ")}`);
  }
}

// ── SALES ──
const salesTotal = await count("sales");
const salesNoArtist = await count("sales", "artist_id=is.null");
const salesCash = await count("sales", "method=eq.cash");
const salesCard = await count("sales", "method=eq.card");
const salesOther = await count("sales", "method=eq.other");
const salesSample = await pull("sales", "created_at,artist_id,team_member_id,method");
const dates = salesSample.map((s) => (s.created_at || "").slice(0, 10)).filter(Boolean).sort();
console.log(`\nSALES: ${salesTotal} total`);
console.log(`  method: card=${salesCard}, cash=${salesCash}, other=${salesOther}`);
console.log(`  NOT attributed to an artist: ${salesNoArtist}`);
const orphanWithTeam = salesSample.filter((s) => !s.artist_id && s.team_member_id).length;
console.log(`  of those, ${orphanWithTeam} DO have a Square team id (fixable via team→artist map)`);
if (dates.length) console.log(`  date range: ${dates[0]} → ${dates[dates.length - 1]}`);

// ── BOOKINGS ──
const bkTotal = await count("bookings");
const bkNoArtist = await count("bookings", "artist_id=is.null");
const bkNoClient = await count("bookings", "client_id=is.null");
const bkSource = await pull("bookings", "source,status");
const bkBySource = {};
for (const b of bkSource) bkBySource[b.source || "?"] = (bkBySource[b.source || "?"] || 0) + 1;
console.log(`\nBOOKINGS: ${bkTotal} total`);
console.log(`  by source: ${Object.entries(bkBySource).map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`  no artist: ${bkNoArtist}, no client: ${bkNoClient}`);

// ── TEAM → ARTIST MAP ──
const team = await pull("square_team_members", "square_id,name,artist_id");
const unmappedTeam = team.filter((t) => !t.artist_id);
console.log(`\nSQUARE TEAM MEMBERS: ${team.length} total, ${unmappedTeam.length} NOT mapped to an artist`);
if (unmappedTeam.length) console.log(`  unmapped: ${unmappedTeam.map((t) => t.name || t.square_id).join(", ")}`);

console.log("\n========================================================\n");
