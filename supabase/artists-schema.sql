-- Lumenati — artist roster (business record). Run after square-schema.sql.
-- The roster used to be a hardcoded array; now it lives here so it can be
-- managed from the dashboard. Keyed by the same artist_id as room_content.

create table if not exists public.artists (
  id          text primary key,            -- short id, matches room_content.id
  slug        text not null unique,        -- public URL: /<slug>
  name        text not null,
  handle      text not null default '',
  color       text not null default '#FF1493',
  -- 2026-07-08 pay-model rebuild: payroll_salary (owner, Gusto) /
  -- payroll_split (shop keeps split_pct, wages via Gusto) /
  -- booth_rent (100% pass-through; rent billed separately, never netted).
  pay_type    text not null default 'payroll_split' check (pay_type in ('payroll_salary','payroll_split','booth_rent')),
  rent_cents  int not null default 0,      -- booth_rent only
  split_pct   numeric not null default 0,  -- 0..1, shop's cut (payroll_split only)
  guest       boolean not null default false,
  active      boolean not null default true,
  room_extras boolean not null default false, -- JD's skate game/video
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.artists enable row level security;

-- Public read (the artist room pages are seen by anonymous visitors); only
-- owners can add/edit/remove.
drop policy if exists artists_public_read on public.artists;
create policy artists_public_read on public.artists for select using (true);
drop policy if exists artists_owner_write on public.artists;
create policy artists_owner_write on public.artists for all
  using (public.is_owner()) with check (public.is_owner());

-- Seed the current six so nothing breaks.
insert into public.artists (id, slug, name, handle, color, pay_type, rent_cents, split_pct, guest, active, room_extras, sort) values
  ('jd',      'jd-pruitt',        'J.D. Pruitt',      'jd.pruitt',       '#FF1493', 'payroll_salary', 0,      0,    false, true, true,  1),
  ('elaine',  'electric-elaine',  'Electric Elaine',  'electric.elaine', '#FFD700', 'booth_rent',     120000, 0,    false, true, false, 2),
  ('shorty',  'shorty',           'ShorTy',           'shorty.tattoo',   '#7FFF00', 'booth_rent',     60000,  0,    false, true, false, 3),
  ('kalypso', 'king-kalypso',     'King Kalypso',     'king.kalypso',    '#1493FF', 'payroll_split',  0,      0.30, false, true, false, 4),
  ('sam',     'sam-durbin-clark', 'Sam Durbin-Clark', 'sam.durbinclark', '#9b59b6', 'booth_rent',     100000, 0,    false, true, false, 5),
  ('moonie',  'moonie-b-jones',   'Moonie B. Jones',  'moonie.b.jones',  '#FF6347', 'payroll_split',  0,      0.40, true,  true, false, 6)
on conflict (id) do nothing;
