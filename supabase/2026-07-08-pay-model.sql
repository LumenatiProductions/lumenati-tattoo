-- 2026-07-08 pay-model rebuild (PAGE-WALK-NOTES 2/11/15).
-- Pay types become: payroll_salary (the owner — salary via Gusto, tickets are
-- shop money), payroll_split (shop keeps split_pct; wages via Gusto),
-- booth_rent (100% pass-through; rent billed separately, never netted).
-- The unused hybrid type is dropped. Exact %s / rent amounts stay as-is —
-- Scott sets the launch numbers via Edit pay.

begin;

alter table public.artists drop constraint if exists artists_pay_type_check;

-- Map the old vocabulary onto the new buckets.
update public.artists set pay_type = 'payroll_split' where pay_type = 'split';
update public.artists set pay_type = 'booth_rent'    where pay_type in ('rent', 'hybrid');

-- J.D. is the salaried owner — no split, never in statements.
update public.artists set pay_type = 'payroll_salary', split_pct = 0 where id = 'jd';

-- Renters keep 100%; a leftover split (ShorTy's old hybrid) is meaningless.
update public.artists set split_pct = 0 where pay_type = 'booth_rent';
update public.artists set rent_cents = 0 where pay_type <> 'booth_rent';

alter table public.artists alter column pay_type set default 'payroll_split';
alter table public.artists add constraint artists_pay_type_check
  check (pay_type in ('payroll_salary', 'payroll_split', 'booth_rent'));

commit;
