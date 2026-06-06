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

## STATUS

Built (2026-06-05). `npm run build` green.

**Shipped — Phases 1 & 2:**
- `supabase/intake-schema.sql` — `consent_forms` table, FKs (`on delete set
  null`) to bookings/clients/artists, `voided`/`void_reason` (never
  hard-delete), `sign_token`, indexes. RLS: owner/bookkeeper/frontdesk r+w;
  artist reads forms for their own bookings; **no anon policy** (the public
  signer goes through the service-role API, token-gated). No DELETE policy.
- `lib/intake/forms.ts` — questionnaire/consent/aftercare spec, `MIN_AGE` (18),
  `computeAgeOk`, `summarizeMedicalFlags`, `SIGNATURE_VIEWBOX`. **All legal copy
  is clearly-marked PLACEHOLDER — must be replaced before go-live.**
- `lib/admin/intake-context.tsx` — provider replacing the stub; exposes
  `unsignedToday` (today's bookings missing a signed form) for the Overview.
- `app/api/intake/route.ts` — staff GET (list + `unsignedToday`), POST (start a
  form, returns the signing URL), PATCH (ID check, placement, void).
- `app/api/intake/sign/route.ts` — public, service-role, token-gated: GET verify
  + POST submit (stamps `signed_at`, computes `age_ok`, summarizes medical
  flags, **blocks under-age self-sign**).
- `app/api/intake/send/route.ts` — emails the signing link via Resend; degrades
  to "copy the link" when `RESEND_API_KEY` is unset.
- `app/admin/(app)/intake/page.tsx` — staff list with signed+ID-checked (green)
  vs needs-attention (amber) badges, new-form panel, ID-check confirm, send
  link, void, full questionnaire/signature view.
- `app/intake/[token]/page.tsx` — public signer (outside the `(site)` group, so
  no legacy bundle): questionnaire + draw-to-sign pad. Signature is stored as
  SVG **path data only** (regex-validated server-side) and rendered with React,
  never `dangerouslySetInnerHTML` — closes the stored-XSS hole.

**To apply before use:** run `supabase/intake-schema.sql` in Supabase (after the
wave-1/2 parents). Then replace the PLACEHOLDER legal text in
`lib/intake/forms.ts` and set `MIN_AGE` for the locale.

**Not built (later phases / other lanes):**
- Phase 3 (block a booking from "completed" without a signed consent) — belongs
  in the Bookings lane / a soft warning on the Overview; not done here to avoid
  touching another feature's files.
- Phase 4 (aftercare ack -> Follow-ups) — wire once Follow-ups lands; the
  `aftercare_ack` flag is in place to drive it.
- ID image storage — intentionally **not** built (default: boolean only).
