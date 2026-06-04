// One-time Square -> Supabase sync, run locally. Mirrors lib/square/sync.ts.
// Needs env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SQUARE_ACCESS_TOKEN.
// Requires the sales/square_team_members/square_sync tables to be temporarily
// writable by anon (see scripts/sql/relax.sql) while this runs.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const BASE = "https://connect.squareup.com";
const V = process.env.SQUARE_VERSION || "2025-04-16";

async function sq(path, init) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Square-Version": V, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(b.errors || b)}`);
  return b;
}

// team members (preserve existing artist mappings)
const tm = await sq("/v2/team-members/search", { method: "POST", body: JSON.stringify({ query: { filter: { status: "ACTIVE" } }, limit: 200 }) });
const members = (tm.team_members || []).map((m) => ({ square_id: m.id, name: [m.given_name, m.family_name].filter(Boolean).join(" ") || m.id }));
const { data: existing } = await sb.from("square_team_members").select("square_id, artist_id");
const prior = new Map((existing || []).map((r) => [r.square_id, r.artist_id]));
const upMembers = await sb.from("square_team_members").upsert(
  members.map((m) => ({ ...m, artist_id: prior.get(m.square_id) ?? null, last_synced: new Date().toISOString() })),
  { onConflict: "square_id" },
);
if (upMembers.error) console.error("members upsert:", upMembers.error.message);
const { data: maps } = await sb.from("square_team_members").select("square_id, artist_id");
const m2a = new Map((maps || []).map((r) => [r.square_id, r.artist_id]));

// payments -> sales
const begin = new Date(Date.now() - 31 * 86400000).toISOString();
let cursor, all = [];
do {
  const params = new URLSearchParams({ begin_time: begin, sort_order: "ASC", limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const p = await sq("/v2/payments?" + params);
  all.push(...(p.payments || []));
  cursor = p.cursor;
} while (cursor);
const completed = all.filter((p) => p.status === "COMPLETED");
const rows = completed.map((p) => {
  const total = p.total_money?.amount ?? p.amount_money?.amount ?? 0;
  const tip = p.tip_money?.amount ?? 0;
  const tax = p.tax_money?.amount ?? 0;
  const tmid = p.team_member_id || p.employee_id || null;
  return { id: p.id, created_at: p.created_at, service_cents: Math.max(0, total - tip - tax), tip_cents: tip, method: p.card_details ? "card" : p.cash_details ? "cash" : "other", team_member_id: tmid, artist_id: tmid ? m2a.get(tmid) ?? null : null, location_id: p.location_id || null, status: p.status, synced_at: new Date().toISOString() };
});
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await sb.from("sales").upsert(rows.slice(i, i + 200), { onConflict: "id" });
  if (error) console.error("sales upsert:", error.message);
}
await sb.from("square_sync").update({ last_synced_at: new Date().toISOString(), last_result: `Synced ${rows.length} payments, ${members.length} team members` }).eq("id", 1);
console.log(`DONE: ${rows.length} sales, ${members.length} team members`);
