# Starter: Follow-ups (aftercare + review requests)

Read `BUILD-PLAN.md` first. Wave 3. FKs to `bookings` and `clients`. Lighter
lift, compounding value — it grows the reputation that feeds Social.

## The idea in one line

After a completed appointment, automatically send the client their aftercare
instructions and, a few days later, a Google-review request. Turn finished work
into healed clients, reviews, and repeat bookings without anyone remembering to
hit send.

## What exists to build on

- Resend is already wired (raw HTTP in `app/api/digest`). Reuse it.
- The ops daily route already runs `runDailyJob` — this feature's job scans for
  due follow-ups and sends them.
- Reads completed `bookings` + `clients` contact info.

## Data model

```
followups (
  id uuid primary key default gen_random_uuid(),
  booking_id text references public.bookings(id) on delete cascade,
  client_id text references public.clients(id) on delete set null,
  kind text not null,                -- aftercare | review_request | rebook_nudge | birthday
  channel text default 'email',      -- email (sms later)
  scheduled_for date,
  status text default 'pending',     -- pending | sent | skipped | failed
  sent_at timestamptz,
  result text,
  created_at timestamptz default now()
)
```
RLS: owner/frontdesk read+write. Cron writes via service role.

## Owned files

`app/admin/(app)/followups/` · `app/api/followups/` (list, manual send/skip,
templates) · `lib/admin/followups-context.tsx` · `supabase/followups-schema.sql`
· `runDailyJob` = enqueue follow-ups for newly-completed bookings, then send any
due today via Resend.

## Page sketch

A queue: who's due for what, when, and status. Manual "send now" / "skip".
A small template editor for the aftercare email and the review-request email
(plain, on-brand, no emojis). Stats: sent this week, reviews requested, pending.

Expose `useFollowups().dueToday` for the Overview tile.

## Phases

1. Table + manual queue + send via Resend + templates.
2. Auto-enqueue on booking completion (aftercare immediately, review request
   +N days), drained by the daily ops job.
3. Rebook nudges for lapsed clients + birthday outreach (reads `clients`).
4. SMS channel later (needs a provider — see external needs).

## External needs from Scott

The shop's **real aftercare wording** and the Google review link. Sending volume
caution: same rule as the Social email work — confirm the Resend sending domain
is set up before turning on automated client emails, so you don't burn domain
reputation. SMS would need Twilio (or similar) — out of scope until asked.

## STATUS

Built (2026-06-05). `npm run build` green.

**Shipped — Phases 1, 2 & 3** (Phase 4 / SMS deferred, needs a provider):

- `supabase/followups-schema.sql` — `followups` table (per spec) + a
  `followup_templates` table (one editable row per kind: subject, body,
  `lead_days`, `enabled`). FKs `on delete cascade` (booking) / `set null`
  (client). Unique `(booking_id, kind)` index makes enqueue idempotent (NULL
  booking_ids stay distinct, so rebook/birthday don't collide). RLS:
  owner/bookkeeper/frontdesk r+w; templates also readable by artists; cron
  writes via service role.
- `lib/followups/templates.ts` — default copy for all four kinds (aftercare +
  review on by default; rebook + birthday off), `{{first_name}}` `{{shop_name}}`
  `{{review_link}}` token fill, `resolveTemplate` (DB over defaults), and
  `renderEmail` (branded HTML shell, review-link button). **All copy is
  PLACEHOLDER** until Scott supplies the shop's real aftercare wording.
- `lib/followups/job.ts` — `runDailyJob` enqueues off completed bookings
  (aftercare immediate, review request `+lead_days`), lapsed-client rebook
  nudges, and birthday outreach — all idempotent (booking upsert; client +
  time-window de-dupe for the others). Only enqueues enabled kinds; backfill
  capped to the last 14 days. Then drains due follow-ups via Resend **only when
  `FOLLOWUPS_AUTOSEND=true` AND `RESEND_API_KEY` is set** — the domain-rep
  guardrail. Enqueue is always safe to run; sending is the gated part.
- `app/api/followups/route.ts` — staff GET (list, filter by status/kind), POST
  ("Scan now" = run enqueue on demand), PATCH (skip / re-queue).
  `app/api/followups/send/route.ts` — manual "Send now" (human-initiated, bypasses
  the autosend gate + schedule). `app/api/followups/templates/route.ts` — GET all
  (merged with defaults), PUT one.
- `lib/admin/followups-context.tsx` — provider replacing the stub; exposes
  `dueToday` (+ `pending`, `sentThisWeek`) for the Overview, plus
  scan/send/skip/requeue/saveTemplate mutations.
- `app/admin/(app)/followups/page.tsx` — the queue (Due/Pending/Sent/Skipped/
  Failed/All filters), per-row Send now / Skip / Re-queue, stats, an inline
  template editor (subject/body/lead-days/on-off per kind), and a visible note
  explaining the manual-vs-autosend behaviour.

**External needs still open (from Scott):** real aftercare wording + Google
review link (`GOOGLE_REVIEW_URL` env, or paste into the template body); confirm
the Resend sending domain, then set `FOLLOWUPS_AUTOSEND=true` to turn on nightly
sends. SMS channel unbuilt (needs Twilio).

**Integration pass TODO:** surface `useFollowups().dueToday` on the Overview tile.
