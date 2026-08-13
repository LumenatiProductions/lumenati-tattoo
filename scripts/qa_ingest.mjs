#!/usr/bin/env node
// Bridge: ingest qa/findings.json onto the QA board.
// Reads the findings array committed to qa/findings.json and POSTs it to
// /api/qa/findings so it lands in the qa_findings table (Admin -> QA). This is
// the temporary bus until Grok Bot POSTs to the endpoint directly.
//
// Env:
//   QA_SERVER_SECRET   required — the x-secret the endpoint checks
//   QA_INGEST_URL      optional — defaults to the prod endpoint
//
// Usage: QA_SERVER_SECRET=... node scripts/qa_ingest.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const URL = process.env.QA_INGEST_URL || "https://lumenati-tattoo.vercel.app/api/qa/findings";
const SECRET = process.env.QA_SERVER_SECRET;
if (!SECRET) {
  console.error("QA_SERVER_SECRET is not set.");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const findings = JSON.parse(readFileSync(join(here, "..", "qa", "findings.json"), "utf8") || "[]");
if (!findings.length) {
  console.log("qa/findings.json is empty — nothing to ingest.");
  process.exit(0);
}

const r = await fetch(URL, {
  method: "POST",
  headers: { "x-secret": SECRET, "Content-Type": "application/json" },
  body: JSON.stringify({ findings }),
});
console.log(r.status, (await r.text()).slice(0, 300));
process.exit(r.status >= 300 ? 1 : 0);
