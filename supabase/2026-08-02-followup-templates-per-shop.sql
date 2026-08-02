-- Security pass fix: followup_templates uniqueness was global on `kind`, but the
-- multitenant seam (2026-07-02) added shop_id without widening the key. Two upsert
-- sites used onConflict "kind", so the moment a second shop exists, one shop's
-- template edit clobbers another shop's row (shop_id, subject, body, enabled all
-- overwritten) and can inject the wrong shop's copy into automated client sends.
-- Make uniqueness per-shop: (shop_id, kind). No FK references this table's kind,
-- so dropping the single-column primary key is safe.

-- Drop the old kind-only primary key (name is the Postgres default).
alter table public.followup_templates
  drop constraint if exists followup_templates_pkey;

-- New primary key on (shop_id, kind): one template per shop per kind. The PK's
-- implicit unique index is the conflict target the upserts now name.
alter table public.followup_templates
  add constraint followup_templates_pkey primary key (shop_id, kind);

-- Stripe webhook replay/duplicate backstop. The handlers are individually
-- idempotent, but the dispute/partial-refund handlers only push notifications, so
-- a re-delivered (or captured-and-replayed) signed event spams the owner. Claim
-- each event id here; a unique-violation on re-delivery is the skip signal.
-- Server-only: RLS on, zero policies, service-role writes only.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  type text,
  received_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;

-- PostgREST caches the schema; reload so upserts and the new table are visible.
notify pgrst, 'reload schema';
