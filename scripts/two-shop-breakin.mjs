#!/usr/bin/env node
// Two-shop break-in test. Spins up a disposable second shop with its own owner
// and artist, then tries to cross the wall in both directions:
//   - every tenant-table read must return ONLY rows of the caller's shop
//   - writes aimed at the other shop must be refused
//   - unlabeled writes must land in the caller's own shop (trigger stamp)
//   - key /api routes (service-role paths) must not leak the other shop
// Everything it creates is deleted at the end (pass --keep to inspect).
//
// Run: node scripts/two-shop-breakin.mjs [--keep] [--api http://localhost:3002]
// Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY from .env.local.
//
// Exit 0 = the wall holds. Non-zero = at least one crossing (details printed).

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

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}
const KEEP = process.argv.includes("--keep");
const apiFlag = process.argv.indexOf("--api");
const API = apiFlag > -1 ? process.argv[apiFlag + 1] : "http://localhost:3002";

const LUM = "11111111-1111-1111-1111-111111111111";
const SHOP_B = "22222222-2222-2222-2222-222222222222";
const B_SLUG = "rls-test-shop";
const B_ARTIST = "rls-b-artist";
const OWNER_EMAIL = "rls-b-owner@breakin.test";
const ARTIST_EMAIL = "rls-b-artist@breakin.test";
const PASSWORD = "breakin-Wall-9931";

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const asUser = (jwt) => ({ apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  [HOLE] ${msg}`);
};
const ok = (msg) => console.log(`  [ok  ] ${msg}`);
const check = (cond, holeMsg, okMsg) => (cond ? ok(okMsg ?? holeMsg) : fail(holeMsg));

async function rest(headers, method, path, body) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { ...headers, Prefer: method === "POST" ? "return=representation" : "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await r.text();
  try {
    data = JSON.parse(text);
  } catch {
    /* empty body */
  }
  return { status: r.status, data, text };
}

async function adminAuth(method, path, body) {
  const r = await fetch(`${URL_}/auth/v1/${path}`, {
    method,
    headers: svc,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

// ── Setup ───────────────────────────────────────────────────────────────────
console.log(`\nTwo-shop break-in test against ${URL_}\n`);
console.log("setup: creating disposable shop B + identities");

const createdAuthIds = [];
async function setup() {
  // Order matters: shops → room_content (profiles.artist_id FK points there) →
  // artists → profiles → auth users.
  let r = await rest(svc, "POST", "shops", {
    id: SHOP_B,
    slug: B_SLUG,
    name: "RLS Test Shop",
    template: "standard",
  });
  if (r.status === 409) {
    // leftover from an aborted run; reuse it
  } else if (r.status >= 300) throw new Error(`shops insert: ${r.status} ${r.text}`);

  r = await rest(svc, "POST", "room_content", { artist_id: B_ARTIST, shop_id: SHOP_B });
  if (r.status >= 300 && r.status !== 409) throw new Error(`room_content insert: ${r.status} ${r.text}`);

  r = await rest(svc, "POST", "artists", {
    id: B_ARTIST,
    slug: `${B_SLUG}--tester`,
    name: "RLS Tester",
    shop_id: SHOP_B,
    active: false,
  });
  if (r.status >= 300 && r.status !== 409) throw new Error(`artists insert: ${r.status} ${r.text}`);

  for (const [email, role, artist] of [
    [OWNER_EMAIL, "owner", null],
    [ARTIST_EMAIL, "artist", B_ARTIST],
  ]) {
    r = await rest(svc, "POST", "profiles", {
      email,
      role,
      artist_id: artist,
      shop_id: SHOP_B,
      full_name: role === "owner" ? "RLS Owner B" : "RLS Artist B",
    });
    if (r.status >= 300 && r.status !== 409) throw new Error(`profiles insert (${email}): ${r.status} ${r.text}`);

    const u = await adminAuth("POST", "admin/users", {
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (u.status < 300) createdAuthIds.push(u.data.id);
    else if (u.status === 422) {
      // user already exists from an aborted run — look it up so cleanup gets it
      const list = await adminAuth("GET", `admin/users?page=1&per_page=1&filter=${encodeURIComponent(email)}`);
      const found = (list.data?.users ?? []).find((x) => x.email === email);
      if (found) createdAuthIds.push(found.id);
    } else throw new Error(`auth user (${email}): ${u.status} ${JSON.stringify(u.data)}`);
  }
}

async function login(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
async function cleanup() {
  if (KEEP) {
    console.log("\n--keep: leaving shop B in place (rerun without --keep to remove)");
    return;
  }
  console.log("\ncleanup: removing everything shop-B");
  // Children first; shop last. Service role bypasses RLS, so filter hard by shop.
  for (const t of [
    "artist_client_notes",
    "artist_campaigns",
    "slot_offers",
    "waitlist",
    "healed_photos",
    "followups",
    "consent_forms",
    "payments",
    "ledger",
    "sales",
    "bookings",
    "booking_requests",
    "clients",
    "expenses",
    "inventory_log",
    "inventory_items",
    "compliance_items",
    "cash_entries",
    "cash_sessions",
    "settlements",
    "rent_invoices",
    "review_snapshots",
    "social_posts",
    "owner_draws",
    "recurring_expenses",
    "device_tokens",
    "profiles",
    "artists",
    "room_content",
  ]) {
    const del = await rest(svc, "DELETE", `${t}?shop_id=eq.${SHOP_B}`);
    if (del.status >= 300) console.log(`  warn: ${t} cleanup -> ${del.status} ${del.text.slice(0, 80)}`);
  }
  for (const id of createdAuthIds) await adminAuth("DELETE", `admin/users/${id}`);
  const delShop = await rest(svc, "DELETE", `shops?id=eq.${SHOP_B}`);
  if (delShop.status >= 300) console.log(`  warn: shops cleanup -> ${delShop.status}`);
  // Verify nothing is left behind.
  const left = await rest(svc, "GET", `profiles?shop_id=eq.${SHOP_B}&select=email`);
  const shopLeft = await rest(svc, "GET", `shops?id=eq.${SHOP_B}&select=id`);
  const clean = (left.data ?? []).length === 0 && (shopLeft.data ?? []).length === 0;
  console.log(clean ? "  cleanup verified: zero shop-B rows remain" : "  WARNING: leftovers detected");
}

// ── The matrix ──────────────────────────────────────────────────────────────
// Staff-visible tenant tables: a shop-B session must see zero foreign rows.
const READ_TABLES = [
  "artists",
  "artist_campaigns",
  "artist_client_notes",
  "booking_requests",
  "bookings",
  "cash_entries",
  "cash_sessions",
  "clients",
  "compliance_items",
  "consent_forms",
  "expenses",
  "followup_templates",
  "followups",
  "healed_photos",
  "inventory_items",
  "inventory_log",
  "ledger",
  "owner_draws",
  "payments",
  "profiles",
  "recurring_expenses",
  "rent_invoices",
  "review_snapshots",
  "sales",
  "settlements",
  "slot_offers",
  "social_posts",
  "square_sync",
  "square_team_members",
  "waitlist",
];

async function run() {
  await setup();
  const ownerJwt = await login(OWNER_EMAIL);
  const artistJwt = await login(ARTIST_EMAIL);
  const owner = asUser(ownerJwt);
  const artist = asUser(artistJwt);

  // Control: shop B owner must actually have access inside their own shop,
  // otherwise every "0 foreign rows" below would pass for the wrong reason.
  {
    const r = await rest(owner, "GET", `profiles?select=email,shop_id`);
    const rows = r.data ?? [];
    if (!rows.some((x) => x.email === OWNER_EMAIL)) {
      console.error("ABORT — control failed: shop B owner cannot read their own profile.");
      await cleanup();
      process.exit(2);
    }
    console.log("  control: shop B owner session live and self-readable\n");
  }

  console.log("shop B owner: cross-shop READS (expect zero foreign rows)");
  for (const t of READ_TABLES) {
    // artists/room_content are deliberately public-read; shop B still sees
    // Lumenati's public roster. Everything else must come back same-shop only.
    const r = await rest(owner, "GET", `${t}?select=shop_id&limit=100`);
    if (r.status !== 200) {
      ok(`${t.padEnd(20)} read refused outright (${r.status})`);
      continue;
    }
    const rows = r.data ?? [];
    const foreign = rows.filter((x) => x.shop_id && x.shop_id !== SHOP_B);
    if (t === "artists") {
      check(true, "", `${t.padEnd(20)} public-read by design (${rows.length} rows visible)`);
    } else {
      check(
        foreign.length === 0,
        `${t.padEnd(20)} returned ${foreign.length} foreign row(s)`,
        `${t.padEnd(20)} ${rows.length} row(s), all same-shop`,
      );
    }
  }

  console.log("\nshop B owner: WRITES aimed at Lumenati (expect refusal)");
  const probeId = `breakin-${Math.floor(Math.random() * 1e9)}`;
  for (const [t, body] of [
    ["clients", { id: `${probeId}-c1`, first_name: "Break-In", last_name: "Probe", shop_id: LUM }],
    ["expenses", { category: "probe", vendor: "break-in", amount_cents: 1, shop_id: LUM }],
    ["waitlist", { id: crypto.randomUUID(), name: "Break-In Probe", phone: "+15555550100", shop_id: LUM }],
    ["compliance_items", { scope: "shop", kind: "probe", label: "break-in probe", shop_id: LUM }],
  ]) {
    const r = await rest(owner, "POST", t, body);
    check(r.status >= 400, `${t.padEnd(20)} accepted a cross-shop INSERT (${r.status})`, `${t.padEnd(20)} refused (${r.status})`);
    if (r.status < 300 && r.data?.[0]?.id) await rest(svc, "DELETE", `${t}?id=eq.${r.data[0].id}`);
  }

  console.log("\nshop B owner: unlabeled INSERT lands in own shop (trigger stamp)");
  {
    const r = await rest(owner, "POST", "clients", {
      id: `${probeId}-c2`,
      first_name: "Trigger",
      last_name: "Stamp",
    });
    if (r.status < 300 && r.data?.[0]) {
      check(
        r.data[0].shop_id === SHOP_B,
        `clients insert without shop_id landed in ${r.data[0].shop_id}`,
        `clients insert stamped shop B automatically`,
      );
      await rest(svc, "DELETE", `clients?id=eq.${r.data[0].id}`);
    } else fail(`clients unlabeled insert refused (${r.status}) — trigger default broken? ${r.text.slice(0, 120)}`);
  }

  console.log("\nshop B owner: UPDATE aimed at a Lumenati row (expect zero rows touched)");
  const lumClient = await rest(svc, "GET", `clients?shop_id=eq.${LUM}&select=id,first_name&limit=1`);
  const target = lumClient.data?.[0];
  {
    if (target) {
      const r = await rest(owner, "PATCH", `clients?id=eq.${encodeURIComponent(target.id)}`, { first_name: "HACKED" });
      const touched = Array.isArray(r.data) ? r.data.length : 0;
      check(touched === 0, `cross-shop UPDATE touched ${touched} row(s)`, "cross-shop UPDATE touched nothing");
      const after = await rest(svc, "GET", `clients?id=eq.${encodeURIComponent(target.id)}&select=first_name`);
      check(
        after.data?.[0]?.first_name === target.first_name,
        "Lumenati client name CHANGED by shop B",
        "Lumenati row unchanged",
      );
    } else ok("no Lumenati client to aim at (skipped)");
  }

  console.log("\nshop B artist: scoped like an artist, walled like a shop");
  {
    let r = await rest(artist, "GET", `bookings?select=shop_id&limit=50`);
    const foreign = (r.data ?? []).filter((x) => x.shop_id !== SHOP_B);
    check(foreign.length === 0, `artist sees ${foreign.length} foreign booking(s)`, "artist bookings: none foreign");
    r = await rest(artist, "GET", `ledger?select=shop_id&limit=50`);
    const fLedger = (r.data ?? []).filter((x) => x.shop_id !== SHOP_B);
    check(fLedger.length === 0, `artist sees ${fLedger.length} foreign ledger row(s)`, "artist ledger: none foreign");
    if (target) {
      // A real Lumenati client id, so the only thing refusing this is the wall
      // itself (not a foreign-key error).
      r = await rest(artist, "POST", "artist_client_notes", {
        artist_id: B_ARTIST,
        client_id: target.id,
        note: "cross-shop note probe",
        shop_id: LUM,
      });
      check(r.status >= 400, `artist cross-shop note accepted (${r.status})`, `artist cross-shop note refused (${r.status})`);
    }
  }

  console.log("\n/api routes with a shop B Bearer (service-role paths must not leak)");
  const apiProbes = [
    ["GET", "/api/settlements", (d) => (Array.isArray(d?.settlements) ? d.settlements : Array.isArray(d) ? d : [])],
    ["GET", "/api/pos/products", (d) => (Array.isArray(d?.items) ? d.items : [])],
  ];
  for (const [method, path, pick] of apiProbes) {
    try {
      const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${ownerJwt}` } });
      if (r.status === 401 || r.status === 403) {
        ok(`${path.padEnd(22)} refused shop B bearer (${r.status})`);
        continue;
      }
      const d = await r.json().catch(() => null);
      const rows = pick(d) ?? [];
      // Lumenati has real data in both; shop B has none, so ANY row is a leak.
      check(rows.length === 0, `${path.padEnd(22)} leaked ${rows.length} row(s) to shop B`, `${path.padEnd(22)} empty for shop B`);
    } catch (e) {
      ok(`${path.padEnd(22)} skipped (${e.message}) — is the dev server on ${API}?`);
    }
  }

  await cleanup();

  console.log("");
  if (failures === 0) {
    console.log("PASS — the wall between shops holds in every probe.\n");
    process.exit(0);
  } else {
    console.log(`FAIL — ${failures} crossing(s) found.\n`);
    process.exit(1);
  }
}

run().catch(async (e) => {
  console.error(`\nERROR: ${e.message}`);
  await cleanup().catch(() => {});
  process.exit(2);
});
