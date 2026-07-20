// Lumenati roster update — STAGED 2026-07-20, awaiting JD's approval.
//
// Source: the COO/bookkeeper's numbers passed on by Scott. Their note said the
// figures "will change in the new location" and need confirming with JD, so this
// runs in DRY RUN by default and prints the exact diff. Nothing is written until
// someone runs it with --commit.
//
//   node scripts/stage-roster-2026-07.mjs            # dry run, prints the diff
//   node scripts/stage-roster-2026-07.mjs --commit   # applies it
//
// PRE-REQ for Grey: supabase/2026-07-20-contractor-split.sql must be applied
// first (adds the `contractor_split` pay type). The script checks and tells you.
//
// NOT handled here on purpose:
//   • Erin Blaney — no pay terms known yet, so she's left off entirely.
//   • Logins/invites — creating accounts emails real artists. That's a separate,
//     explicit step (the Team page), never a side effect of a roster load.
//   • Bank account / Tax ID — those go into Stripe by hand, never through code.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const COMMIT = process.argv.includes("--commit");
const LUM = "11111111-1111-1111-1111-111111111111";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// name        = what to match on / create as (matched case-insensitively, loosely)
// pay_type    = booth_rent | payroll_salary | contractor_split
// rent_cents  = monthly booth rent (booth_rent only)
// split_pct   = the SHOP's cut (contractor_split only) — Grey keeps 70%, shop 30%
const ROSTER = [
  { match: "J.D.",     name: "J.D. Pruitt",      pay_type: "payroll_salary" },
  { match: "Elaine",   name: "Electric Elaine",  pay_type: "booth_rent", rent_cents: 110000 },
  { match: "Kalypso",  name: "King Kalypso",     pay_type: "booth_rent", rent_cents: 110000 },
  { match: "Shor",     name: "ShorTy",           pay_type: "booth_rent", rent_cents: 120000 },
  { match: "Sam",      name: "Sam Durbin-Clark", pay_type: "booth_rent", rent_cents: 30000 },
  { match: "Moonie",   name: "Moonie B. Jones",  pay_type: "booth_rent", rent_cents: 100000 },
  // New to the roster:
  { match: "Elise",    name: "Elise Lloyd",      pay_type: "booth_rent", rent_cents: 120000, isNew: true },
  // Grey uses they/them. 70/30: they keep 70%, the shop keeps 30%.
  { match: "Grey",     name: "Grey Barrix",      pay_type: "contractor_split", split_pct: 0.30, isNew: true },
];

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-");

const describe = (r) =>
  r.pay_type === "booth_rent" ? `$${(r.rent_cents / 100).toFixed(0)}/mo rent (1099: none — they pay us)`
  : r.pay_type === "contractor_split" ? `${Math.round(r.split_pct * 100)}% to shop, contractor (we 1099 them)`
  : "salary via payroll";

const { data: current, error } = await db
  .from("artists").select("id,name,pay_type,rent_cents,split_pct,active,sort").eq("shop_id", LUM);
if (error) { console.error("Could not read the roster:", error.message); process.exit(1); }

// Guard: contractor_split needs the migration applied first.
if (ROSTER.some((r) => r.pay_type === "contractor_split")) {
  const probe = await db.from("artists").select("id").eq("pay_type", "contractor_split").limit(1);
  if (probe.error && /violates|check constraint|invalid/i.test(probe.error.message)) {
    console.error("Apply supabase/2026-07-20-contractor-split.sql first (Grey needs the new pay type).");
    process.exit(1);
  }
}

console.log(COMMIT ? "APPLYING roster changes\n" : "DRY RUN — nothing will be written\n");
const plan = [];
for (const want of ROSTER) {
  const found = current.find((a) => a.name.toLowerCase().includes(want.match.toLowerCase()));
  const fields = {
    name: want.name,
    pay_type: want.pay_type,
    rent_cents: want.rent_cents ?? 0,
    split_pct: want.split_pct ?? 0,
    active: true,
  };
  if (!found) {
    console.log(`  NEW    ${want.name.padEnd(18)} ${describe(want)}`);
    plan.push({ kind: "insert", fields: { ...fields, id: slugify(want.name), slug: slugify(want.name), shop_id: LUM, sort: 90 } });
  } else {
    const before = found.pay_type === "booth_rent" ? `$${((found.rent_cents ?? 0) / 100).toFixed(0)}/mo rent`
      : found.pay_type === "payroll_split" ? `${Math.round((Number(found.split_pct) || 0) * 100)}% split via payroll`
      : found.pay_type;
    const changed = found.pay_type !== fields.pay_type
      || (found.rent_cents ?? 0) !== fields.rent_cents
      || Number(found.split_pct ?? 0) !== fields.split_pct;
    if (!changed) { console.log(`  same   ${want.name.padEnd(18)} ${describe(want)}`); continue; }
    console.log(`  CHANGE ${want.name.padEnd(18)} ${before}  ->  ${describe(want)}`);
    plan.push({ kind: "update", id: found.id, fields });
  }
}

// Anyone on the roster the new list doesn't mention (e.g. Erin isn't here at all
// yet). Flag, never auto-deactivate — that's a human call.
const untouched = current.filter((a) => !ROSTER.some((r) => a.name.toLowerCase().includes(r.match.toLowerCase())));
if (untouched.length) {
  console.log("\n  Not in the new list (left exactly as-is):");
  for (const a of untouched) console.log(`    - ${a.name} (${a.pay_type})`);
}

if (!COMMIT) {
  console.log("\nRe-run with --commit to apply.");
  process.exit(0);
}

for (const step of plan) {
  const res = step.kind === "insert"
    ? await db.from("artists").insert(step.fields)
    : await db.from("artists").update(step.fields).eq("id", step.id).eq("shop_id", LUM);
  console.log(res.error ? `  FAILED ${step.fields.name}: ${res.error.message}` : `  ok ${step.fields.name}`);
}
console.log("\nDone. Logins/invites are still a separate manual step on the Team page.");
