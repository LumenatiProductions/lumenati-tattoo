#!/usr/bin/env node
// Point Supabase Auth's sign-in-code emails at Resend.
//
// Why: auth already sends through Resend, but from Resend's sandbox address
// (onboarding@resend.dev), which only delivers to the Resend account owner's
// inbox. Everyone else gets a 500 "Error sending magic link email" (QA
// lum-034). This swaps the sender to an address on a verified domain.
//
// Needs SUPABASE_ACCESS_TOKEN in the environment (Scott's ~/.zshrc has it)
// and RESEND_API_KEY in .env.local (already there).
//
//   node scripts/set-auth-smtp.mjs --check
//   node scripts/set-auth-smtp.mjs "signin@mail.lumenatitattoo.com"
//
// The address must be on a domain that shows Verified at resend.com/domains.

import fs from "node:fs";

const REF = "humjddiwzzanvvqztypy";
const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set (source ~/.zshrc first).");
  process.exit(1);
}

function envLocal(name) {
  const line = fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, "") : "";
}

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function show() {
  const r = await fetch(API, { headers });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  const pick = ["smtp_host", "smtp_port", "smtp_user", "smtp_admin_email", "smtp_sender_name", "smtp_max_frequency", "rate_limit_email_sent", "external_email_enabled"];
  for (const k of pick) console.log(`${k} = ${d[k] ?? "(unset)"}`);
  console.log(`smtp_pass = ${d.smtp_pass ? "(set)" : "(unset)"}`);
  if (!d.smtp_host) console.log("\nCustom SMTP is OFF: only team-member inboxes get sign-in codes.");
  else if (/resend\.dev$/.test(d.smtp_admin_email ?? "")) console.log("\nSandbox sender: only the Resend account owner gets sign-in codes.");
  else console.log("\nCustom SMTP is ON with a real sender.");
}

const arg = process.argv[2];
if (!arg || arg === "--check") {
  await show();
  process.exit(0);
}

const sender = arg.replace(/^.*<|>.*$/g, "").trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sender)) {
  console.error(`Not an email address: ${arg}`);
  process.exit(1);
}
const resendKey = envLocal("RESEND_API_KEY");
if (!resendKey) {
  console.error("RESEND_API_KEY missing from .env.local");
  process.exit(1);
}

// Prove the sender's domain is verified in Resend before touching auth.
const domain = sender.split("@")[1];
const dr = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${resendKey}` } });
if (dr.ok) {
  const list = (await dr.json()).data ?? [];
  const hit = list.find((d) => d.name === domain);
  if (!hit || hit.status !== "verified") {
    console.error(`${domain} is not a verified domain in Resend (${hit ? hit.status : "not added"}). Verify it first.`);
    process.exit(1);
  }
} else {
  console.log("(Resend key is send-only; skipping the domain check. Make sure the domain shows Verified.)");
}

const body = {
  smtp_host: "smtp.resend.com",
  smtp_port: "465",
  smtp_user: "resend",
  smtp_pass: resendKey,
  smtp_admin_email: sender,
  smtp_sender_name: "Lumenati Tattoo",
  smtp_max_frequency: 60,
  // Custom SMTP lifts the built-in cap; keep a sane ceiling.
  rate_limit_email_sent: 60,
};
const r = await fetch(API, { method: "PATCH", headers, body: JSON.stringify(body) });
const d = await r.json();
if (!r.ok) {
  console.error("PATCH failed:", JSON.stringify(d));
  process.exit(1);
}
console.log(`Sign-in codes now send from ${sender} through Resend.\n`);
await show();
