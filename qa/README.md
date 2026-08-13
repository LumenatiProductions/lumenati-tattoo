# QA board — the Grok Bot ↔ Claude loop

One shared board, backed by the `qa_findings` table and shown live in the
Command Center at **Admin → QA**. Scott watches it there.

**Roles:** Grok Bot is QA (finds and verifies). Claude is the builder (fixes).

## The loop
1. **Grok Bot** files findings (`status: new`).
2. **Claude** picks up each `new`, fixes it, sets `status: fixed` + the `commit_sha`.
3. **Grok Bot** re-checks each `fixed` → `verified` (or `reopened` with a `note`).

## How findings get onto the board

**Target (preferred): POST to the API.** Once you have the URL + secret:
```
POST https://lumenati-tattoo.vercel.app/api/qa/findings
Header:  x-secret: <QA_SERVER_SECRET>
Body:    { "findings": [ <finding>, ... ] }     # or a single <finding>
```
Update lifecycle:
```
PATCH https://lumenati-tattoo.vercel.app/api/qa/findings
Header:  x-secret: <QA_SERVER_SECRET>
Body:    { "ext_id": "gb-001", "status": "verified", "note": "..." }
```
The endpoint also accepts an admin session (that's how the Admin → QA page reads
it), so `x-secret` is only for server-to-server. `QA_SERVER_SECRET` is set in
Vercel; without it, only the admin-session path is live.

**Bridge (until you POST directly): write `qa/findings.json`.** Put the array of
new findings in this file via your PR path, then run the ingest:
```
QA_SERVER_SECRET=... node scripts/qa_ingest.mjs
```
It POSTs the file onto the board. Findings land as `new`; their lifecycle then
lives in the table (advanced by PATCH), so this file is just the inbox — it's
kept empty (`[]`) at rest.

## Finding shape
```json
{
  "ext_id":   "gb-001",              // your stable id; used to dedupe/update
  "surface":  "/admin/qr",           // page or route the finding is on
  "severity": "P0",                  // P0 | P1 | P2 | P3
  "finding":  "One-line description of what's wrong",
  "repro":    "Exact steps to see it",
  "owner":    "grokbot"              // grokbot | claude | scott
}
```
`status` defaults to `new`. `commit_sha` and `note` are set by Claude on fix.
Re-filing the same `ext_id` updates the existing row (no duplicates).

## Status lifecycle
- **new** — filed, not yet worked. (Default.)
- **fixed** — Claude shipped a fix; `commit_sha` points at it. Awaiting a re-check.
- **verified** — Grok Bot confirmed the fix holds. Done.
- **reopened** — the fix didn't hold; `note` says how it still fails. Back to work.
- **wontfix** — intentionally not fixing; `note` says why.

## Board ordering
The page groups by status in loop order: Reopened, New, Fixed (awaiting verify),
Verified, Won't fix. Severity rides each card (P0 hottest).

## Schema
See `supabase/2026-08-12-qa-findings.sql`. Server-only: RLS on with no policies;
all access is through the service role inside `/api/qa/findings`.
