#!/usr/bin/env node
// Resubmit the Twilio A2P 10DLC campaign on the real domain.
//
// The campaign was rejected (30908 privacy policy, 30882 terms) because the
// policy pages lived on the shared lumenati-tattoo.vercel.app host. Twilio
// only lets you delete + recreate a campaign, so this reads the current one,
// swaps every vercel.app URL for lumenatitattoo.com, deletes it, and files
// it again on the same brand + messaging service.
//
//   node scripts/a2p-resubmit.mjs --dry   # show what would be filed
//   node scripts/a2p-resubmit.mjs         # do it
//
// Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID
// from .env.local. Check first that https://lumenatitattoo.com/privacy and
// /terms load over https (Twilio's vetting fetches them).

import fs from "node:fs";

const OLD = "https://lumenati-tattoo.vercel.app";
const NEW = "https://lumenatitattoo.com";
const dry = process.argv.includes("--dry");

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const sid = env.TWILIO_ACCOUNT_SID;
const token = env.TWILIO_AUTH_TOKEN;
const ms = env.TWILIO_MESSAGING_SERVICE_SID;
if (!sid || !token || !ms) {
  console.error("Missing TWILIO_* in .env.local");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
const base = `https://messaging.twilio.com/v1/Services/${ms}/Compliance/Usa2p`;

for (const path of ["/privacy", "/terms", "/request"]) {
  const r = await fetch(NEW + path, { redirect: "manual" }).catch(() => null);
  if (!r || r.status !== 200) {
    console.error(`${NEW}${path} is not serving 200 yet (${r ? r.status : "no response"}). Wait for the cert.`);
    process.exit(1);
  }
}

const list = await (await fetch(base, { headers: { Authorization: auth } })).json();
const cur = (list.compliance || [])[0];
if (!cur) {
  console.error("No existing campaign on the messaging service.");
  process.exit(1);
}
const swap = (s) => (typeof s === "string" ? s.split(OLD).join(NEW) : s);

const form = new URLSearchParams();
form.set("BrandRegistrationSid", cur.brand_registration_sid);
form.set("Description", swap(cur.description));
form.set("MessageFlow", swap(cur.message_flow));
for (const s of cur.message_samples) form.append("MessageSamples", swap(s));
form.set("UsAppToPersonUsecase", cur.us_app_to_person_usecase);
form.set("HasEmbeddedLinks", String(cur.has_embedded_links));
form.set("HasEmbeddedPhone", String(cur.has_embedded_phone));
if (cur.opt_out_message) form.set("OptOutMessage", cur.opt_out_message);
if (cur.help_message) form.set("HelpMessage", cur.help_message);
for (const k of cur.opt_out_keywords || []) form.append("OptOutKeywords", k);
for (const k of cur.help_keywords || []) form.append("HelpKeywords", k);
if (cur.opt_in_message) form.set("OptInMessage", cur.opt_in_message);
for (const k of cur.opt_in_keywords || []) form.append("OptInKeywords", k);
form.set("SubscriberOptIn", "true");
form.set("AgeGated", "false");
form.set("DirectLending", "false");

console.log(`Current campaign ${cur.sid}: ${cur.campaign_status}`);
console.log("Filing with:");
console.log("  message_flow:", swap(cur.message_flow).slice(0, 200) + "...");
console.log("  samples:", cur.message_samples.map(swap).join("\n           "));
if (dry) process.exit(0);

const del = await fetch(`${base}/${cur.sid}`, { method: "DELETE", headers: { Authorization: auth } });
if (![204, 200].includes(del.status)) {
  console.error("Delete failed:", del.status, await del.text());
  process.exit(1);
}
console.log("Old campaign deleted.");

const r = await fetch(base, {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
  body: form,
});
const d = await r.json();
if (!r.ok) {
  console.error("Create failed:", r.status, JSON.stringify(d, null, 1));
  process.exit(1);
}
console.log(`New campaign ${d.sid}: ${d.campaign_status}`);
console.log("Check back with: curl -u SID:TOKEN " + base);
