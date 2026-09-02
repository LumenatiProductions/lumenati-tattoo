#!/usr/bin/env node
// Resubmit the Twilio A2P 10DLC campaign on the real domain.
//
// The campaign was rejected (30908 privacy policy, 30882 terms) because the
// campaign never set PrivacyPolicyUrl / TermsAndConditionsUrl (the vetter
// does not read links out of MessageFlow) and the pages lived on vercel.app. Twilio
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
// 9/2 rejection 30913: "marketing consent was combined with other consents". The
// form always had a separate, unchecked marketing checkbox; the filing just never
// said so. Spell both consents out, and keep every sample transactional.
const MESSAGE_FLOW =
  "End users opt in on the public booking request form at https://lumenatitattoo.com/request. " +
  "They enter their name and mobile number. Directly above the Send button they see this disclosure and agree to it by submitting: " +
  "'By submitting, you agree that Lumenati Tattoo may text and email you about your appointment: reminders, consent forms, and aftercare. " +
  "Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help,' with links to our Privacy Policy " +
  "(https://lumenatitattoo.com/privacy) and Terms (https://lumenatitattoo.com/terms). This consent covers transactional appointment messages only. " +
  "Marketing consent is collected separately, on the same form, with its own checkbox that is unchecked by default: " +
  "'Text or email me news, flash days, and offers from the shop (optional). Message frequency varies. Message and data rates may apply. Reply STOP to opt out.' " +
  "Clients who leave that box unchecked never receive marketing messages. " +
  "Clients can also opt in to appointment texts in person at the studio or by phone when they book, and can ask to be texted when a slot opens. " +
  "Booth renters and artists opt in when they join the studio and give their number for shop notifications like rent invoices. " +
  "Every message includes STOP to opt out and HELP for help. Opt-in data is never shared with third parties.";
const SAMPLES = [
  "Lumenati Tattoo: reminder, you have a tattoo appointment tomorrow at 2:00 PM with your artist at 3100 N Downing St. Need to reschedule? Reply here or call the shop. Reply STOP to opt out.",
  "Lumenati Tattoo: your consent form is ready to sign before your appointment. It takes about two minutes: https://lumenatitattoo.com/sign/example Reply STOP to opt out.",
  "Lumenati Tattoo: you asked us to text you when a spot opened with your artist. One just did, this Friday: https://lumenatitattoo.com/claim/example Reply STOP to opt out.",
  "Lumenati Tattoo: thanks for coming in today. Your aftercare guide and healing timeline are here: https://lumenatitattoo.com/care/example Reply STOP to opt out.",
  "Lumenati Tattoo: your booth rent invoice for this month is ready. View and pay it here: https://lumenatitattoo.com/admin/rent Reply STOP to opt out.",
];
form.set("MessageFlow", MESSAGE_FLOW);
for (const s of SAMPLES) form.append("MessageSamples", s);
form.set("UsAppToPersonUsecase", cur.us_app_to_person_usecase);
form.set("HasEmbeddedLinks", String(cur.has_embedded_links));
form.set("HasEmbeddedPhone", String(cur.has_embedded_phone));
if (cur.opt_out_message) form.set("OptOutMessage", cur.opt_out_message);
if (cur.help_message) form.set("HelpMessage", cur.help_message);
for (const k of cur.opt_out_keywords || []) form.append("OptOutKeywords", k);
for (const k of cur.help_keywords || []) form.append("HelpKeywords", k);
if (cur.opt_in_message) form.set("OptInMessage", cur.opt_in_message);
for (const k of cur.opt_in_keywords || []) form.append("OptInKeywords", k);
// The vetter reads these two fields, not the links inside MessageFlow.
// Every earlier rejection (30908 / 30882) came from leaving them unset.
form.set("PrivacyPolicyUrl", `${NEW}/privacy`);
form.set("TermsAndConditionsUrl", `${NEW}/terms`);
form.set("SubscriberOptIn", "true");
form.set("AgeGated", "false");
form.set("DirectLending", "false");

console.log(`Current campaign ${cur.sid}: ${cur.campaign_status}`);
console.log("Filing with:");
console.log("  message_flow:", MESSAGE_FLOW.slice(0, 200) + "...");
console.log("  samples:", SAMPLES.join("\n           "));
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
