-- Lumenati — contractor on a split (2026-07-20)
-- Run: node scripts/apply-sql.mjs supabase/2026-07-20-contractor-split.sql
--
-- Grey Barrix is a 70/30 split but is a CONTRACTOR, not payroll: the shop
-- collects the client's money, keeps 30%, and pays Grey 70%. Because the money
-- flows shop -> artist, Grey gets a 1099 at year end. The existing
-- `payroll_split` type assumes wages through Gusto (W-2), which is the wrong
-- treatment here, so add a fourth type.
--
-- How the three non-salary types differ:
--   booth_rent       artist pays the shop rent, keeps 100% of their sales.
--                    Shop issues no 1099 (money flows artist -> shop).
--   payroll_split    shop keeps a cut, pays the rest as W-2 WAGES via Gusto.
--   contractor_split shop keeps a cut, pays the rest to a CONTRACTOR.
--                    Shop issues a 1099 once they clear $600 in a year.

alter table public.artists drop constraint if exists artists_pay_type_check;
alter table public.artists add constraint artists_pay_type_check
  check (pay_type in ('payroll_salary', 'payroll_split', 'booth_rent', 'contractor_split'));
