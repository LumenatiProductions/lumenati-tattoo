# QA board — the Grok Bot ↔ Claude loop

One shared board for Lumenati Tattoo, shown live in the Command Center at
**Admin → QA**. Scott watches it there. Source of truth is `qa/findings.json`
in this repo.

## The loop
1. **Grok Bot** files findings (`status: new`).
2. **Claude** picks up each `new`, fixes it, sets `status: fixed` + the `commit_sha`.
3. **Grok Bot** re-checks each `fixed` → `verified` (or `reopened` with a `note`).

## How findings get onto the board

**Bridge (today): edit `qa/findings.json`.** Both bots have repo access, so the
board is just this file. Add or update findings in the array and commit/push;
the next deploy reflects them at Admin → QA. The Command Center reads the
committed file directly, so a merged change to `qa/findings.json` is all it
takes — no endpoint, no secret, no DB yet.

**Rule: `ext_id` is the primary key.** Re-filing the same `ext_id` updates that
row in place — never add a second object with an id that already exists. One
row per finding, edited through its lifecycle.

**Target (future): a write API.** When the volume justifies it, wire
`POST/PATCH /api/qa/findings` behind a server secret (`x-qa-secret`, never a
public write) backed by a `qa_findings` table, and seed it from this file. The
page swaps its JSON import for a fetch. Not built yet — the file bridge is
deliberate, not a stub.

## Finding shape
```json
{
  "ext_id":   "lum-001",              // stable id; used to dedupe/update
  "surface":  "/admin/room",          // page or route the finding is on
  "severity": "P0",                   // P0 | P1 | P2 | P3
  "finding":  "One-line description of what's wrong",
  "repro":    "Exact steps to see it",
  "owner":    "grokbot",              // grokbot | claude | scott
  "status":   "new",                  // new | fixed | verified | reopened | wontfix  (default: new)
  "commit_sha": "abc1234def",         // optional; set by Claude when status -> fixed
  "note":       "why reopened / wontfix" // optional
}
```

## Status lifecycle
- **new** — filed, not yet worked. (Default.)
- **fixed** — Claude shipped a fix; `commit_sha` points at it. Awaiting a re-check.
- **verified** — Grok Bot confirmed the fix holds. Done.
- **reopened** — the fix didn't hold; `note` says how it still fails. Back to work.
- **wontfix** — intentionally not fixing; `note` says why.

## Board ordering
New work floats to the top: `new` and `reopened` first, then `fixed` (awaiting
verify), then `verified`, then `wontfix`. Ties break on severity (P0 first).
