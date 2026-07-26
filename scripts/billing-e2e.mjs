#!/usr/bin/env node
// Billing e2e against LOCAL dev (:3002) + the live DB, in Stripe TEST mode.
// A disposable tenant walks the whole membership arc:
//   node scripts/billing-e2e.mjs setup     -> wizard shop + owner login, GET status, checkout URL
//   node scripts/billing-e2e.mjs check     -> after paying in the browser: status flipped by webhook?
//   node scripts/billing-e2e.mjs lock      -> expire the trial clock, prove open:false
//   node scripts/billing-e2e.mjs cleanup   -> cancel test sub, delete shop + auth user
// Self-contained on purpose (same spirit as two-shop-breakin.mjs). TEST DATA ONLY.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const SK = env.STRIPE_SECRET_KEY;
const APP = "http://localhost:3002";
const OWNER_EMAIL = "billing-e2e-owner@lumenati.test";
const PASSWORD = "BillingE2E!2026";
const SHOP_NAME = "Billing E2E Parlor";
const SLUG = "billing-e2e-parlor";

const step = process.argv[2] ?? "setup";

async function rest(method, path, body) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

async function login() {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: PASSWORD }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(`login failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function billing(token, method = "GET", body) {
  const r = await fetch(`${APP}/api/billing`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

async function shopRow() {
  const { data } = await rest("GET", `shops?slug=eq.${SLUG}&select=*`);
  return data?.[0] ?? null;
}

if (step === "setup") {
  const r = await fetch(`${APP}/api/shops/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: env.SHOP_WIZARD_CODE,
      shopName: SHOP_NAME,
      ownerEmail: OWNER_EMAIL,
      ownerName: "Billing E2E",
      artists: ["Testa Uno", "Testa Dos"],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`wizard: ${r.status} ${JSON.stringify(j)}`);
  console.log("shop created:", j.slug);

  // Password auth user so the API takes a Bearer (the wizard's invite email
  // obviously never lands for a .test address).
  const u = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const uj = await u.json();
  if (u.status >= 300 && u.status !== 422) throw new Error(`auth user: ${u.status} ${JSON.stringify(uj)}`);
  console.log("owner login ready");

  const token = await login();
  const g = await billing(token);
  console.log("GET /api/billing:", g.status, JSON.stringify(g.data));

  const c = await billing(token, "POST", { action: "checkout", plan: "founding" });
  console.log("checkout:", c.status, c.data.url ?? c.data.error);
} else if (step === "check") {
  const token = await login();
  const g = await billing(token);
  console.log("GET /api/billing:", g.status, JSON.stringify(g.data));
  const p = await billing(token, "POST", { action: "portal" });
  console.log("portal:", p.status, (p.data.url ?? p.data.error ?? "").slice(0, 60));
  const s = await shopRow();
  console.log("shop row:", JSON.stringify({
    status: s.billing_status, plan: s.billing_plan, seats: s.billing_seats,
    period_end: s.billing_period_end, sub: (s.stripe_subscription_id ?? "").slice(0, 8),
  }));
} else if (step === "lock") {
  // Rewind to an expired pre-checkout trial and prove the door shuts.
  const s = await shopRow();
  await rest("PATCH", `shops?slug=eq.${SLUG}`, {
    billing_status: "trial",
    billing_period_end: new Date(Date.now() - 86_400_000).toISOString(),
  });
  const token = await login();
  const g = await billing(token);
  console.log("expired-trial GET:", g.status, "open =", g.data.open, "status =", g.data.status);
  // put the real state back
  await rest("PATCH", `shops?slug=eq.${SLUG}`, {
    billing_status: s.billing_status,
    billing_period_end: s.billing_period_end,
  });
  console.log("state restored:", s.billing_status);
} else if (step === "cleanup") {
  const s = await shopRow();
  if (s?.stripe_subscription_id) {
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${s.stripe_subscription_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SK}` },
    });
    console.log("test subscription canceled:", r.status);
  }
  if (s) {
    for (const t of ["room_content", "artists", "profiles"]) {
      await rest("DELETE", `${t}?shop_id=eq.${s.id}`);
    }
    await rest("DELETE", `shops?id=eq.${s.id}`);
    console.log("shop rows deleted");
  }
  const list = await fetch(`${URL_}/auth/v1/admin/users?filter=${encodeURIComponent(OWNER_EMAIL)}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  }).then((r) => r.json());
  const found = (list.users ?? []).find((x) => x.email === OWNER_EMAIL);
  if (found) {
    await fetch(`${URL_}/auth/v1/admin/users/${found.id}`, {
      method: "DELETE",
      headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
    });
    console.log("auth user deleted");
  }
} else {
  console.error("unknown step");
  process.exit(2);
}
