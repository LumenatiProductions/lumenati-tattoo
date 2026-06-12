-- How each artist is paid, for the money coach: 1099 contractor (booth
-- renters, most splits) vs W-2 employee (payroll withholding exists). Lives on
-- artist_goals because it's the artist's own tax situation, not shop config.
alter table public.artist_goals
  add column if not exists tax_status text not null default '1099';
alter table public.artist_goals
  drop constraint if exists artist_goals_tax_status_chk;
alter table public.artist_goals
  add constraint artist_goals_tax_status_chk check (tax_status in ('1099', 'w2'));
