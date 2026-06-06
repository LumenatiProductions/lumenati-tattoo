-- Lumenati — Clients (CRM) schema. Wave 1, depends on nothing (the `artists`
-- table referenced below is already applied). Run after square-schema.sql /
-- auth-schema.sql so the SECURITY DEFINER helpers (my_role/my_artist/is_owner)
-- exist — we reuse them, never redefine.
--
-- One row per person who walks in. Square is the source of truth for customers;
-- this table mirrors them (like `sales` mirrors Square payments) and also lets
-- staff add walk-ins by hand. The nightly ops job (lib/clients/job.ts) refreshes
-- Square-sourced rows and rolls up spend.

create table if not exists public.clients (
  id                  text primary key,                 -- Square customer id, or generated id for a hand-added walk-in
  square_customer_id  text,                             -- null when manually added; set for Square-mirrored rows
  first_name          text not null default '',
  last_name           text not null default '',
  email               text,
  phone               text,
  instagram           text,                             -- lets a client be linked to a social_posts credit
  birthdate           date,                             -- age check + birthday outreach
  notes               text not null default '',
  preferred_artist_id text references public.artists(id) on delete set null,
  total_spent_cents   int not null default 0,           -- denormalized rollup from Square payments, refreshed by the job
  first_seen          date,
  last_seen           date,
  source              text not null default 'manual',   -- manual | square (provenance / the seam, mirrors social_posts.source)
  created_at          timestamptz not null default now(),
  synced_at           timestamptz not null default now()
);

create unique index if not exists clients_square_customer_idx
  on public.clients (square_customer_id) where square_customer_id is not null;
create index if not exists clients_last_seen_idx on public.clients (last_seen desc);
create index if not exists clients_name_idx      on public.clients (last_name, first_name);
create index if not exists clients_artist_idx    on public.clients (preferred_artist_id);

-- ── RLS ──
-- Read + write: owner / bookkeeper / front desk run the front-of-house, so they
-- manage clients. Artists should eventually read only the clients tied to their
-- own bookings — but `bookings` doesn't exist yet, so that policy is deferred
-- (see the commented stub below; add it when STARTER-2-BOOKINGS lands).
-- The nightly job writes via the service-role client, which bypasses RLS.
alter table public.clients enable row level security;

drop policy if exists clients_staff_read on public.clients;
create policy clients_staff_read on public.clients for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists clients_staff_write on public.clients;
create policy clients_staff_write on public.clients for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

-- Deferred until `bookings` exists — an artist reads clients they have a booking with:
-- create policy clients_artist_read on public.clients for select
--   using (public.my_role() = 'artist' and exists (
--     select 1 from public.bookings b
--     where b.client_id = clients.id and b.artist_id = public.my_artist()
--   ));
