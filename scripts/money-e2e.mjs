#!/usr/bin/env node
// Deep-logic pass, area 1 proofs (2026-08-02). Run from the repo root with
// the :3002 dev server up:  node scripts/money-e2e.mjs
// Hits the LIVE Supabase DB using ONLY disposable demo-tenant rows (Stripe
// stays in TEST mode).
// Proves, end to end:
//   A. charge.refunded webhook -> reverseRefundBooks writes tax/rent reversals
//      with kind PRESERVED (P&L remittance nets out), sale/tip as 'refund';
//      replay (same event id) short-circuits; a second event id no-ops.
//   B. /api/cash/receive on a cash-rent handoff books the rentinv_<id> ledger
//      row (idempotent with the web mark_paid path).
//   C. /pay/<token>/checkout on a tax-carrying (terminal merch) payment now
//      charges the tax: Stripe session amount_total includes it.
//   D. a repriced checkout (tip change) EXPIRES the superseded session.
// Cleanup: ledger nets to zero via reversing rows; every other row deleted.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const req = createRequire(import.meta.url);
const { createClient } = req("@supabase/supabase-js");
const Stripe = req("stripe");

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
const BASE = "http://127.0.0.1:3002";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-05-28.basil" });
const whsec = env.STRIPE_WEBHOOK_SECRET;

let pass = 0,
  fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} ${extra}`);
  }
};

// ── demo tenant + owner bearer ───────────────────────────────────────────────
const REVIEW_EMAIL = "applereview@lumenati.app";
const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
const reviewUser = users.users.find((u) => u.email === REVIEW_EMAIL);
if (!reviewUser) throw new Error("review user missing");
const PW = `e2e-${randomUUID()}`;
await db.auth.admin.updateUserById(reviewUser.id, { password: PW });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: sess, error: pwErr } = await anon.auth.signInWithPassword({ email: REVIEW_EMAIL, password: PW });
if (pwErr) throw new Error(`password grant: ${pwErr.message}`);
const bearer = sess.session.access_token;
const { data: profile } = await db.from("profiles").select("shop_id, role").eq("email", REVIEW_EMAIL).maybeSingle();
const SHOP = profile.shop_id;
console.log(`demo shop ${SHOP}, role ${profile.role}`);

const cleanup = { payments: [], invoices: [], entries: [], events: [], ledgerRev: [] };

try {
  // ── A. refund reversal kinds ──────────────────────────────────────────────
  console.log("A. charge.refunded reversal kinds");
  const piId = `pi_e2e_${randomUUID().replace(/-/g, "")}`;
  const { data: payA, error: payErr } = await db
    .from("payments")
    .insert({
      shop_id: SHOP,
      kind: "ticket",
      amount_cents: 5000,
      tip_cents: 1000,
      tax_cents: 700,
      status: "paid",
      pay_token: `e2e${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      stripe_payment_intent_id: piId,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (payErr) throw new Error(`seed payment: ${payErr.message}`);
  cleanup.payments.push(payA.id);
  const mk = (kind, cents, suffix) => ({
    shop_id: SHOP,
    source: "stripe",
    kind,
    direction: "in",
    amount_cents: cents,
    external_id: `pay_${payA.id}_${suffix}`,
    created_by: "e2e",
  });
  const { error: ledSeedErr } = await db
    .from("ledger")
    .insert([mk("sale", 5000, "svc"), mk("tip", 1000, "tip"), mk("tax", 700, "tax")]);
  if (ledSeedErr) throw new Error(`seed ledger: ${ledSeedErr.message}`);

  const evt = (id, obj, type) =>
    JSON.stringify({
      id,
      object: "event",
      api_version: "2025-05-28.basil",
      created: Math.floor(Date.now() / 1000),
      type,
      data: { object: obj },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
    });
  const post = async (payload) => {
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
    const r = await fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      body: payload,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const chargeObj = {
    id: `ch_e2e_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    object: "charge",
    payment_intent: piId,
    refunded: true,
    amount_refunded: 6700,
  };
  const evtId1 = `evt_e2e_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  cleanup.events.push(evtId1);
  const r1 = await post(evt(evtId1, chargeObj, "charge.refunded"));
  ok(r1.status === 200, `webhook accepted (${r1.status})`, JSON.stringify(r1.body));

  const { data: refunded } = await db.from("payments").select("status").eq("id", payA.id).single();
  ok(refunded.status === "refunded", "payment flipped to refunded");
  const { data: revRows } = await db
    .from("ledger")
    .select("kind, direction, amount_cents, external_id, id, reverses")
    .like("external_id", `pay_${payA.id}_%_rev`);
  const byExt = Object.fromEntries((revRows ?? []).map((r) => [r.external_id.replace(`pay_${payA.id}_`, ""), r]));
  ok(revRows?.length === 3, `3 reversal rows (${revRows?.length})`);
  ok(byExt["svc_rev"]?.kind === "refund" && byExt["svc_rev"]?.direction === "out", "sale reversal kind=refund");
  ok(byExt["tip_rev"]?.kind === "refund", "tip reversal kind=refund");
  ok(byExt["tax_rev"]?.kind === "tax" && byExt["tax_rev"]?.direction === "out", "TAX reversal keeps kind=tax", JSON.stringify(byExt["tax_rev"]));

  const r2 = await post(evt(evtId1, chargeObj, "charge.refunded"));
  ok(r2.body?.duplicate === true, "replay of same event id short-circuits");
  const evtId2 = `evt_e2e_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  cleanup.events.push(evtId2);
  const r3 = await post(evt(evtId2, chargeObj, "charge.refunded"));
  ok(r3.status === 200, "second event id accepted");
  const { data: revRows2 } = await db.from("ledger").select("id").like("external_id", `pay_${payA.id}_%_rev`);
  ok(revRows2?.length === 3, `no double reversal on re-event (${revRows2?.length})`);

  // ── B. cash rent receive books the ledger ─────────────────────────────────
  console.log("B. cash-rent receive -> ledger");
  const { data: artistRow } = await db.from("artists").select("id").eq("shop_id", SHOP).limit(1).maybeSingle();
  const period = "2091-01"; // far-future period so it can't collide with a real invoice
  const { data: inv, error: invErr } = await db
    .from("rent_invoices")
    .insert({ shop_id: SHOP, artist_id: artistRow?.id ?? null, amount_cents: 12345, period, status: "pending" })
    .select("id")
    .single();
  if (invErr) throw new Error(`seed invoice: ${invErr.message}`);
  cleanup.invoices.push(inv.id);
  const { data: entry, error: entErr } = await db
    .from("cash_entries")
    .insert({
      shop_id: SHOP,
      date: new Date().toISOString().slice(0, 10),
      artist_id: artistRow?.id ?? null,
      amount_cents: 12345,
      tax_cents: 0,
      note: "e2e rent handoff",
      entered_by: "e2e",
      rent_invoice_id: inv.id,
      handed_off_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (entErr) throw new Error(`seed entry: ${entErr.message}`);
  cleanup.entries.push(entry.id);

  const rec = await fetch(`${BASE}/api/cash/receive`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ entryId: entry.id }),
  });
  const recBody = await rec.json().catch(() => ({}));
  ok(rec.status === 200 && recBody.rentPaid === true, `receive ok + rentPaid (${rec.status})`, JSON.stringify(recBody));
  const { data: invAfter } = await db.from("rent_invoices").select("status").eq("id", inv.id).single();
  ok(invAfter.status === "paid", "invoice flipped to paid");
  const { data: rentLed } = await db
    .from("ledger")
    .select("id, kind, direction, amount_cents")
    .eq("external_id", `rentinv_${inv.id}`)
    .eq("source", "cash");
  ok(
    rentLed?.length === 1 && rentLed[0].kind === "rent" && rentLed[0].direction === "in" && rentLed[0].amount_cents === 12345,
    "rent ledger row booked (kind=rent, 12345c)",
    JSON.stringify(rentLed),
  );
  // receive again -> no double ledger row
  await fetch(`${BASE}/api/cash/receive`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ entryId: entry.id }),
  });
  const { data: rentLed2 } = await db.from("ledger").select("id").eq("external_id", `rentinv_${inv.id}`).eq("source", "cash");
  ok(rentLed2?.length === 1, "second receive is a no-op (still 1 row)");

  // ── C. pay-link charges the tax on a terminal merch row ──────────────────
  console.log("C. pay link charges merch tax");
  const tokenC = `e2e${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const { data: payC, error: payCErr } = await db
    .from("payments")
    .insert({ shop_id: SHOP, kind: "ticket", amount_cents: 2000, tip_cents: 0, tax_cents: 160, status: "pending", pay_token: tokenC })
    .select("id")
    .single();
  if (payCErr) throw new Error(`seed payC: ${payCErr.message}`);
  cleanup.payments.push(payC.id);
  const co1 = await fetch(`${BASE}/pay/${tokenC}/checkout?tip=0`, { redirect: "manual" });
  const loc1 = co1.headers.get("location") ?? "";
  ok(co1.status === 303 && loc1.includes("checkout.stripe.com"), `checkout redirects to Stripe (${co1.status})`, loc1);
  const { data: payCAfter } = await db.from("payments").select("stripe_session_id, surcharge_cents").eq("id", payC.id).single();
  const sess1 = await stripe.checkout.sessions.retrieve(payCAfter.stripe_session_id);
  const expected1 = 2000 + 160 + (payCAfter.surcharge_cents ?? 0);
  ok(sess1.amount_total === expected1, `session total includes tax (${sess1.amount_total} == ${expected1})`);

  // ── D. repriced checkout expires the old session ──────────────────────────
  console.log("D. superseded session expires");
  const co2 = await fetch(`${BASE}/pay/${tokenC}/checkout?tip=500`, { redirect: "manual" });
  ok(co2.status === 303, `repriced checkout ok (${co2.status})`);
  const { data: payCAfter2 } = await db.from("payments").select("stripe_session_id").eq("id", payC.id).single();
  ok(payCAfter2.stripe_session_id !== payCAfter.stripe_session_id, "new session minted for new price");
  const old1 = await stripe.checkout.sessions.retrieve(payCAfter.stripe_session_id);
  ok(old1.status === "expired", `old session expired (${old1.status})`);
  const sess2 = await stripe.checkout.sessions.retrieve(payCAfter2.stripe_session_id);
  ok(sess2.amount_total === 2000 + 500 + 160, `repriced total = svc+tip+tax (${sess2.amount_total})`);
  // same-price re-tap returns the SAME session and does NOT expire it
  const co3 = await fetch(`${BASE}/pay/${tokenC}/checkout?tip=500`, { redirect: "manual" });
  const { data: payCAfter3 } = await db.from("payments").select("stripe_session_id").eq("id", payC.id).single();
  const sess2b = await stripe.checkout.sessions.retrieve(payCAfter3.stripe_session_id);
  ok(
    co3.status === 303 && payCAfter3.stripe_session_id === payCAfter2.stripe_session_id && sess2b.status === "open",
    "same-price re-tap reuses the open session",
  );
  try {
    await stripe.checkout.sessions.expire(payCAfter3.stripe_session_id);
  } catch {}
} finally {
  // ── cleanup: ledger nets to zero, everything else deleted ────────────────
  console.log("cleanup");
  // reverse the rent row + the seeded A-rows' NET (originals + their reversals).
  const nets = [];
  for (const invId of cleanup.invoices) {
    const { data: led } = await db.from("ledger").select("id, amount_cents, artist_id").eq("external_id", `rentinv_${invId}`);
    for (const l of led ?? [])
      nets.push({
        shop_id: SHOP,
        source: "cash",
        kind: "rent",
        direction: "out",
        amount_cents: l.amount_cents,
        artist_id: l.artist_id,
        reverses: l.id,
        external_id: `rentinv_${invId}_e2e_rev`,
        created_by: "e2e-cleanup",
        note: "e2e cleanup",
      });
  }
  // A-test: originals got real reversals from the refund path (svc/tip as
  // 'refund', tax as 'tax') — the PAIRS net zero already. Nothing more needed.
  if (nets.length) {
    const { error } = await db.from("ledger").upsert(nets, { onConflict: "source,external_id", ignoreDuplicates: true });
    if (error) console.log("  cleanup ledger:", error.message);
  }
  for (const id of cleanup.entries) await db.from("cash_entries").delete().eq("id", id);
  for (const id of cleanup.invoices) await db.from("rent_invoices").delete().eq("id", id);
  for (const id of cleanup.payments) await db.from("payments").delete().eq("id", id);
  for (const id of cleanup.events) await db.from("stripe_webhook_events").delete().eq("event_id", id);
  await db.auth.admin.updateUserById(reviewUser.id, { password: randomUUID() + randomUUID() });
  console.log("  demo rows removed; review password rotated");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
