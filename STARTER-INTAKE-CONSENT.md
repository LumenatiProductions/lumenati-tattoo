# Starter: Intake & Consent (waivers + age/ID verification)

Read `BUILD-PLAN.md` first. Wave 3. FKs to `bookings` and `clients`. This is a
legal-liability feature, not a nice-to-have.

## The idea in one line

Every tattoo legally needs a signed consent form, an age/ID check, and an
aftercare acknowledgment before the needle touches skin. Replace the paper
clipboard with a digital intake that attaches the signed waiver to the booking
and the client.

## What exists to build on

- Auth/RLS/provider patterns per BUILD-PLAN. Resend is already wired for any
  "your form is ready" emails.
- A form can be filled on a shop tablet (public token link) or by front desk.

## Data model

```
consent_forms (
  id uuid primary key default gen_random_uuid(),
  booking_id text references public.bookings(id) on delete set null,
  client_id text references public.clients(id) on delete set null,
  artist_id text references public.artists(id) on delete set null,
  signed_name text,
  dob date,                          -- captured at signing
  id_checked boolean default false,  -- front desk confirms gov ID
  id_type text,                      -- drivers_license | passport | state_id
  age_ok boolean,                    -- computed >=18 (or local min) at sign time
  placement text,                    -- body area
  medical_flags text default '',     -- allergies, conditions, pregnancy, etc.
  aftercare_ack boolean default false,
  signature_svg text,                -- inline drawn signature (no external storage needed)
  answers jsonb default '{}'::jsonb, -- the full questionnaire snapshot
  signed_at timestamptz,
  created_at timestamptz default now()
)
```
RLS: owner/frontdesk read+write; the assigned artist reads forms for their own
bookings. Forms are records of legal events — **never hard-delete**; add a
`voided boolean` instead if one must be retracted.

## Owned files

`app/admin/(app)/intake/` (staff view of forms) · a public signing route
(token-gated, e.g. `app/intake/[token]/`) · `app/api/intake/` (create form,
submit signature, verify token) · `lib/admin/intake-context.tsx` ·
`supabase/intake-schema.sql`. No cron.

## Page sketch

Staff: list of forms by date/booking, with a green "signed + ID checked" badge
vs an amber "incomplete". Opening a booking shows whether its consent is on
file. Public signer: the questionnaire + a draw-to-sign pad; on submit it stamps
`signed_at`, computes `age_ok` from `dob`, and links to the booking.

Expose `useIntake().unsignedToday` for the Overview (bookings today missing a
signed form).

## Phases

1. Form schema + staff list + a front-desk "new form" that captures everything
   on the shop tablet.
2. Token signing link (text/email the client a link to pre-fill before they
   arrive). Resend for delivery.
3. Block a booking from "completed" if no signed consent (soft warning first).
4. Aftercare acknowledgment ties into Follow-ups.

## External needs from Scott

The actual consent + aftercare + medical-questionnaire **wording** (use the
shop's real legal text; do not invent legal language). Local minimum age if not
18. Whether ID images are stored (default: no — only a "checked" boolean, which
avoids holding sensitive ID scans).
