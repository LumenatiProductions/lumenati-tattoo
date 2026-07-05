-- Lumenati — two roles + phone logins (2026-07-05)
-- The new process: there are ADMINS (run the shop, see everything) and
-- ARTISTS (their own room, money, day). The old bookkeeper/frontdesk tiers
-- fold into admin. Internally the admin role keeps the stored value 'owner'
-- so every existing policy and gate keeps working untouched; only what
-- people SEE changes ("Admin").
--
-- Phone logins: each team member's auth user carries BOTH email and phone
-- (created confirmed by the staff API), so a text-code sign-in still lands
-- on the same account and every email-keyed permission check keeps working.

begin;

-- 1. Fold the old tiers into admin.
update public.profiles set role = 'owner' where role in ('bookkeeper', 'frontdesk');

-- 2. Phone on the allowlist row (E.164, unique when present).
alter table public.profiles add column if not exists phone text;
create unique index if not exists profiles_phone_uniq
  on public.profiles (phone) where phone is not null;

commit;
