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
