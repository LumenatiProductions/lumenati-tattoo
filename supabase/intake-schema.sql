-- Lumenati — Intake & Consent (waivers + age/ID verification) schema. Wave 3.
-- FKs to `bookings` (Wave 2), `clients` (Wave 1) and `artists` — all already
-- applied. Run after bookings-schema.sql / clients-schema.sql / artists-schema.sql
-- so the parents and the SECURITY DEFINER helpers (my_role/my_artist/is_owner)
-- exist. We reuse those helpers, never redefine them.
--
-- One row per consent event. Every tattoo legally needs a signed consent form,
-- an age/ID check, and an aftercare acknowledgment before the needle touches
-- skin — so this replaces the paper clipboard. A form can be filled on a shop
-- tablet by the front desk, or pre-filled by the client via a token link
-- (text/email) before they arrive. Cross-feature FKs are `on delete set null`
-- so a deleted booking/client never orphans the legal record.
--
-- These are records of legal events: NEVER hard-delete. To retract one, set
-- `voided = true` (with a reason) — the row stays for the audit trail.

create table if not exists public.consent_forms (
  id              uuid primary key default gen_random_uuid(),
  booking_id      text references public.bookings(id) on delete set null,
  client_id       text references public.clients(id)  on delete set null,
  artist_id       text references public.artists(id)  on delete set null,
  signed_name     text,                                 -- typed legal name at signing
  dob             date,                                 -- captured at signing
  id_checked      boolean not null default false,       -- front desk confirms gov ID in person
  id_type         text,                                 -- drivers_license | passport | state_id
  age_ok          boolean,                              -- computed >= min age (default 18) from dob at sign time
  placement       text,                                 -- body area being tattooed
  medical_flags   text not null default '',             -- allergies, conditions, pregnancy, blood thinners, etc.
  aftercare_ack   boolean not null default false,       -- acknowledged the aftercare instructions
  signature_svg   text,                                 -- inline drawn signature (no external blob storage needed)
  answers         jsonb not null default '{}'::jsonb,   -- full questionnaire snapshot at sign time
  sign_token      text,                                 -- opaque token for the public pre-fill/sign link (null once retired)
  signed_at       timestamptz,                          -- null until the client/desk completes + signs
  voided          boolean not null default false,       -- retraction flag (never hard-delete a legal record)
  void_reason     text,
  created_by      text,                                 -- staff email that started the form (null for token-link forms)
  created_at      timestamptz not null default now()
);

-- One live token per outstanding link; signed forms keep their token row but it
-- is no longer actionable (the API rejects re-signing).
create unique index if not exists consent_forms_token_idx
  on public.consent_forms (sign_token) where sign_token is not null;
create index if not exists consent_forms_booking_idx on public.consent_forms (booking_id);
create index if not exists consent_forms_client_idx  on public.consent_forms (client_id);
create index if not exists consent_forms_artist_idx  on public.consent_forms (artist_id);
create index if not exists consent_forms_signed_idx  on public.consent_forms (signed_at desc);
create index if not exists consent_forms_created_idx on public.consent_forms (created_at desc);

-- ── RLS ──
-- Read + write: owner / bookkeeper / front desk run intake at the desk. An
-- artist may read forms for their OWN bookings (so they can confirm consent is
-- on file before they start), via the same my_artist() pattern bookings uses.
-- The public signer never touches the DB through RLS — it goes through the
-- token-gated API using the service-role client (bypasses RLS), exactly like the
-- nightly jobs. So there is intentionally NO anon policy here.
alter table public.consent_forms enable row level security;

drop policy if exists consent_forms_staff_read on public.consent_forms;
create policy consent_forms_staff_read on public.consent_forms for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists consent_forms_artist_read on public.consent_forms;
create policy consent_forms_artist_read on public.consent_forms for select
  using (public.my_role() = 'artist' and artist_id = public.my_artist());

-- Write: owner / bookkeeper / front desk only. No UPDATE that flips `voided`
-- back is prevented at the app layer; there is no DELETE policy at all, so even
-- staff cannot hard-delete a legal record through the authed client.
drop policy if exists consent_forms_staff_write on public.consent_forms;
create policy consent_forms_staff_write on public.consent_forms for insert
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists consent_forms_staff_update on public.consent_forms;
create policy consent_forms_staff_update on public.consent_forms for update
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));
