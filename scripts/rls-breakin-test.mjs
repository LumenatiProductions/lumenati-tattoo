#!/usr/bin/env node
// RLS break-in test. Acts as an anonymous internet visitor (public anon key only,
// no session) and tries to READ and WRITE every table that holds money, PII, or
// medical/ID data. A hardened database returns zero rows and refuses every write.
//
// Run: node scripts/rls-breakin-test.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.
//
// Exit code 0 = locked down. Non-zero = at least one hole (details printed).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Parse .env.local defensively: strip surrounding quotes AND any trailing
// backslash-n / whitespace. A corrupted key (this file has been mangled that way
// before) would otherwise make every table 401 and fake a clean pass.
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      const val = l
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\\n$/, "")
        .replace(/[\r\n]+$/, "")
        .trim();
      return [l.slice(0, i).trim(), val];
    }),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in .env.local");
  process.exit(2);
}

// Tables an anonymous visitor must NEVER read rows from or write to. (Public
// booking intake is a separate, intentionally-open path and isn't listed here.)
const SENSITIVE = [
  "clients",            // customer PII, contact info, lifetime value
  "compliance_items",   // consent / medical / ID artifacts
  "consent_forms",      // signed consent, possible medical notes
  "payments",           // money: amounts, Stripe ids, artist splits
  "ledger",             // canonical money ledger
  "sales",              // per-sale money
  "settlements",        // artist payout math
  "rent_invoices",      // booth rent owed
  "artist_expenses",    // artists' private deductions
  "artist_goals",       // artists' private income goals
  "expenses",           // shop expenses
  "cash_entries",       // cash drawer money
  "cash_sessions",      // drawer over/short
  "profiles",           // staff/artist accounts, roles, emails
  "artists",            // includes private pay terms
  "bookings",           // who's coming in, when
  "followups",          // client outreach queue
  "device_tokens",      // push tokens (hijackable)
  "healed_photos",      // client body photos
  "inventory_log",      // internal ops
  "social_posts",       // draft/unpublished marketing
];

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };
const results = [];

// A READ leaks if it returns 200 with at least one row. Empty 200 or a
// permission error both mean no data escaped.
async function probeRead(table) {
  try {
    const r = await fetch(`${URL}/rest/v1/${table}?select=*&limit=1`, { headers });
    const body = await r.text();
    if (r.ok) {
      let rows = [];
      try {
        rows = JSON.parse(body);
      } catch {
        /* non-array 200 = no rows */
      }
      if (Array.isArray(rows) && rows.length > 0) {
        return { hole: true, detail: `200 OK returned ${rows.length} row(s); columns: ${Object.keys(rows[0]).join(", ")}` };
      }
      return { hole: false, detail: "200 but empty (RLS filtered)" };
    }
    return { hole: false, detail: `${r.status} ${r.statusText}` };
  } catch (e) {
    return { hole: false, detail: `network error: ${e.message}` };
  }
}

// A WRITE leaks if the insert is accepted (2xx). Any 4xx = refused.
async function probeWrite(table) {
  try {
    const r = await fetch(`${URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ id: `breakin-probe-${Date.now()}` }),
    });
    if (r.status >= 200 && r.status < 300) {
      return { hole: true, detail: `accepted an anonymous INSERT (${r.status}) — cleaning up` };
    }
    return { hole: false, detail: `refused (${r.status})` };
  } catch (e) {
    return { hole: false, detail: `network error: ${e.message}` };
  }
}

console.log(`\nRLS break-in test — anonymous visitor against ${URL}\n`);

// Control: prove the anon key is actually valid before trusting any "refused"
// result. `artists` re-grants its public display columns to anon, so a good key
// returns 200 here. If this fails, the whole run is meaningless — abort loudly.
{
  const c = await fetch(`${URL}/rest/v1/artists?select=name&limit=1`, { headers });
  const body = await c.text();
  if (c.status !== 200) {
    console.error(`ABORT — control probe failed (HTTP ${c.status}): ${body.slice(0, 120)}`);
    console.error("The anon key is being rejected, so every table would 401 for the WRONG reason.");
    console.error("Fix NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local before trusting this test.\n");
    process.exit(2);
  }
  console.log("  control: anon key valid (artists public columns readable)\n");
}

let holes = 0;
for (const t of SENSITIVE) {
  const read = await probeRead(t);
  const write = await probeWrite(t);
  const bad = read.hole || write.hole;
  if (bad) holes++;
  const mark = bad ? "HOLE" : "ok  ";
  console.log(`  [${mark}] ${t.padEnd(18)} read: ${read.detail}`);
  console.log(`         ${" ".repeat(18)} write: ${write.detail}`);
  if (read.hole) results.push(`${t}: anon can READ rows — ${read.detail}`);
  if (write.hole) results.push(`${t}: anon can WRITE — ${write.detail}`);
}

console.log("");
if (holes === 0) {
  console.log(`PASS — all ${SENSITIVE.length} sensitive tables refuse anonymous reads and writes.\n`);
  process.exit(0);
} else {
  console.log(`FAIL — ${holes} table(s) exposed:\n`);
  for (const r of results) console.log(`  - ${r}`);
  console.log("");
  process.exit(1);
}
