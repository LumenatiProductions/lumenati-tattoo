-- Lumenati — Follow-ups (aftercare + review requests + nudges) schema. Wave 3.
-- FKs to `bookings` (Wave 2) and `clients` (Wave 1) — both already applied. Run
-- after bookings-schema.sql / clients-schema.sql / square-schema.sql / auth-schema.sql
-- so the parents and the SECURITY DEFINER helpers (my_role/my_artist/is_owner)
-- exist. We reuse those helpers, never redefine them.
--
-- One row per scheduled outreach to a client after their visit. The daily ops
-- job (lib/followups/job.ts) enqueues these off newly-completed bookings
-- (aftercare immediately, a review request a few days later), then sends any due
-- today via Resend — so finished work turns into healed clients, reviews, and
-- repeat bookings without anyone remembering to hit send. Cross-feature FKs are
-- `on delete set null` (booking) / `on delete cascade` (client owns the row), so
-- a missing parent never blocks an insert.

create table if not exists public.followups (
  id            uuid primary key default gen_random_uuid(),
  booking_id    text references public.bookings(id) on delete cascade,
  client_id     text references public.clients(id)  on delete set null,
  kind          text not null,                        -- aftercare | review_request | rebook_nudge | birthday
  channel       text not null default 'email',        -- email (sms later)
  scheduled_for date,                                  -- the day this becomes due to send
  status        text not null default 'pending',      -- pending | sent | skipped | failed
  sent_at       timestamptz,
  result        text,                                 -- send id, skip reason, or error detail
  created_at    timestamptz not null default now(),
  constraint followups_kind_chk
    check (kind in ('aftercare','review_request','rebook_nudge','birthday')),
  constraint followups_channel_chk
    check (channel in ('email','sms')),
  constraint followups_status_chk
    check (status in ('pending','sent','skipped','failed'))
);

-- Idempotent enqueue: one follow-up of a given kind per booking. The job upserts
-- on this so re-running never double-sends aftercare/review for the same visit.
-- Not partial (so ON CONFLICT can infer it): rows with a NULL booking_id —
-- rebook_nudge / birthday — never collide because Postgres treats NULLs as
-- distinct, and those kinds are de-duped in the job by client + time window.
create unique index if not exists followups_booking_kind_idx
  on public.followups (booking_id, kind);

create index if not exists followups_status_idx    on public.followups (status);
create index if not exists followups_due_idx        on public.followups (scheduled_for);
create index if not exists followups_client_idx     on public.followups (client_id);
create index if not exists followups_kind_idx       on public.followups (kind);

-- ── RLS ──
-- Read + write: owner / bookkeeper / front desk run outreach. Artists don't
-- touch the follow-up queue. The nightly job writes via the service-role client,
-- which bypasses RLS.
alter table public.followups enable row level security;

drop policy if exists followups_staff_read on public.followups;
create policy followups_staff_read on public.followups for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists followups_staff_write on public.followups;
create policy followups_staff_write on public.followups for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

-- ── Templates ──
-- One editable template per kind. The job + manual send read the row (falling
-- back to code defaults in lib/followups/templates.ts when a row is absent), so
-- the desk can tune wording, the review link, the review-request lead time, and
-- toggle a kind off — without a deploy. `lead_days` is the delay after the visit
-- for review_request; ignored for aftercare (always immediate).
create table if not exists public.followup_templates (
  kind        text primary key,                       -- aftercare | review_request | rebook_nudge | birthday
  subject     text not null default '',
  body        text not null default '',               -- plain text; {{first_name}} {{shop_name}} {{review_link}} tokens
  lead_days   int not null default 0,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  constraint followup_templates_kind_chk
    check (kind in ('aftercare','review_request','rebook_nudge','birthday'))
);

alter table public.followup_templates enable row level security;

-- Any staff can read templates (so the page renders); owner / bookkeeper / front
-- desk edit them. Cron reads via the service-role client.
drop policy if exists followup_templates_read on public.followup_templates;
create policy followup_templates_read on public.followup_templates for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk','artist'));

drop policy if exists followup_templates_write on public.followup_templates;
create policy followup_templates_write on public.followup_templates for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));
