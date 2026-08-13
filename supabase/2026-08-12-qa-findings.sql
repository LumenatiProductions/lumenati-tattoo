-- QA board (Grok Bot <-> Claude). The findings ledger behind Admin -> QA.
-- Grok Bot files findings (status=new); Claude fixes them and stamps the
-- commit; Grok Bot re-verifies. Server-only: RLS on, no policies — every read
-- and write goes through the service role in /api/qa/findings, which gates on
-- an admin session or the shared x-secret. Idempotent.

create table if not exists public.qa_findings (
  id           bigint generated always as identity primary key,
  ext_id       text unique,                 -- filer's own id; dedupe key on upsert
  surface      text not null,
  severity     text not null default 'P2',  -- P0 | P1 | P2 | P3
  finding      text not null,
  repro        text,
  status       text not null default 'new', -- new | fixed | verified | reopened | wontfix
  owner        text,                        -- grokbot | claude | scott
  commit_sha   text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_qa_findings_status on public.qa_findings (status);

alter table public.qa_findings enable row level security;
-- No policies on purpose: anon/authenticated get nothing directly. All access
-- is via the service role inside /api/qa/findings (same posture as ops_events).

-- Seed the two findings that bootstrapped the board. Both are already fixed and
-- live in prod, so they enter as `fixed` awaiting Grok Bot's verify pass — the
-- builder (Claude) handing off to QA (Grok Bot).
insert into public.qa_findings (ext_id, surface, severity, finding, repro, status, owner, commit_sha)
values
  ('lum-001', '/admin/room', 'P0',
   'Intermittent full-app crash: white card ''Something broke. / Try again'' on ~2 of 3 loads of /admin/room. Editor sometimes renders. Multiple GoTrueClient warning in console.',
   'Sign in as App Review owner (500) 555-0100 / 000000. Hard-load /admin/room repeatedly.',
   'fixed', 'claude', '52c2be5'),
  ('lum-002', '/admin/qr', 'P1',
   'App Review demo shop shows a QR card for J.D. Pruitt / @jd.pruitt linking to /jd-pruitt. Demo roster is Sam Rivera and Max Doyle — real-shop data leaking into the review tenant.',
   'Sign in as applereview@. Open /admin/qr.',
   'fixed', 'claude', 'c33b79a')
on conflict (ext_id) do nothing;
