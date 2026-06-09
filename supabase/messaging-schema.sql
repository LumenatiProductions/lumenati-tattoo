-- Lumenati — Messaging expansion (reminders + healed-photo follow-ups)
-- Run in the Supabase SQL editor AFTER followups-schema.sql.
--
-- Adds three followup kinds:
--   reminder_48h / reminder_24h — pre-appointment reminders that actually
--     prevent no-shows (the deposit system only punishes them after the fact)
--   healed_photo — ~2 weeks after a completed session, ask the client for a
--     healed shot for the portfolio/Social wall
-- The kind lives in a CHECK constraint, so widen it in place. Idempotent.

alter table public.followups drop constraint if exists followups_kind_chk;
alter table public.followups add constraint followups_kind_chk
  check (kind in ('aftercare','review_request','rebook_nudge','birthday',
                  'reminder_48h','reminder_24h','healed_photo'));

alter table public.followup_templates drop constraint if exists followup_templates_kind_chk;
alter table public.followup_templates add constraint followup_templates_kind_chk
  check (kind in ('aftercare','review_request','rebook_nudge','birthday',
                  'reminder_48h','reminder_24h','healed_photo'));
