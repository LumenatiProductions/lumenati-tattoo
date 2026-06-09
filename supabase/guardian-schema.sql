-- Lumenati — Guardian co-sign on consent forms (minors policy)
-- Run in the Supabase SQL editor AFTER intake-schema.sql.
--
-- OFF by default: the signer still blocks minors unless the shop opts in by
-- setting MINORS_GUARDIAN_CONSENT=true on Vercel (check your state/local body-
-- art rules with counsel before flipping it). When on, an under-age signer must
-- have a guardian co-sign: name, DOB (verified adult), relationship, and their
-- own drawn signature, stored alongside the minor's.

alter table public.consent_forms
  add column if not exists guardian_name          text,
  add column if not exists guardian_dob           date,
  add column if not exists guardian_relationship  text,
  add column if not exists guardian_signature_svg text;
