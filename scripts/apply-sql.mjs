#!/usr/bin/env node
// Apply one supabase/*.sql file to the LIVE database via the Management API.
// Usage: node scripts/apply-sql.mjs supabase/2026-07-09-artist-own-bookings.sql
// Needs SUPABASE_ACCESS_TOKEN in the environment (Scott's ~/.zshrc has it).
// The whole file is sent as ONE batch so function bodies survive intact.

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <path-to.sql>");
  process.exit(2);
}
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set (source ~/.zshrc first).");
  process.exit(2);
}

const sql = readFileSync(file, "utf8");
const r = await fetch("https://api.supabase.com/v1/projects/humjddiwzzanvvqztypy/database/query", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const body = await r.json().catch(() => null);
if (r.status >= 300) {
  console.error("FAILED", r.status, JSON.stringify(body).slice(0, 500));
  process.exit(1);
}
console.log("applied", file, "->", r.status);
