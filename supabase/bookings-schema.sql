-- Lumenati — Bookings (appointments + deposits + no-shows) schema. Wave 2.
-- FKs to `clients` (Wave 1) and `artists` — both already applied. Run after
-- clients-schema.sql / artists-schema.sql / square-schema.sql so the parents and
-- the SECURITY DEFINER helpers (my_role/my_artist/is_owner) exist. We reuse those
-- helpers, never redefine them.
--
-- One row per appointment. Square Appointments is mirrored here (like `sales`
-- mirrors Square payments) via the nightly ops job, and staff can also create /
-- edit bookings by hand. The money that leaks in a tattoo shop is the deposit:
-- taken up front, then either APPLIED to the final ticket or FORFEITED on a
-- no-show — so deposit_status is first-class, and past `scheduled` appointments
-- are auto-flagged `no_show` for review by the job.

create table if not exists public.bookings (
  id                    text primary key,                 -- Square appointment id, or a generated id for a hand-made booking
  square_appointment_id text,                             -- null when manual; set for Square-mirrored rows
  client_id             text references public.clients(id) on delete set null,
  artist_id             text references public.artists(id) on delete set null,
  starts_at             timestamptz not null,
  ends_at               timestamptz,
  status                text not null default 'scheduled', -- scheduled | completed | no_show | cancelled
  service_desc          text not null default '',
  est_price_cents       int not null default 0,
  deposit_cents         int not null default 0,
  deposit_status        text not null default 'none',     -- none | held | applied | forfeited | refunded
  deposit_payment_id    text,                             -- Square payment id for the deposit, once related
  sale_id               text references public.sales(id) on delete set null, -- the final ticket once completed
  notes                 text not null default '',
  source                text not null default 'manual',   -- manual | square | web_request (provenance / the seam)
  created_at            timestamptz not null default now(),
  synced_at             timestamptz not null default now(),
  constraint bookings_status_chk
    check (status in ('scheduled','completed','no_show','cancelled')),
  constraint bookings_deposit_status_chk
    check (deposit_status in ('none','held','applied','forfeited','refunded'))
);

create unique index if not exists bookings_square_appt_idx
  on public.bookings (square_appointment_id) where square_appointment_id is not null;
create index if not exists bookings_starts_idx  on public.bookings (starts_at);
create index if not exists bookings_artist_idx  on public.bookings (artist_id);
create index if not exists bookings_client_idx  on public.bookings (client_id);
create index if not exists bookings_status_idx  on public.bookings (status);

-- ── RLS ──
-- Read: owner / bookkeeper / front desk run the calendar and see everything; an
-- artist sees only their own bookings. Write: owner / bookkeeper / front desk
-- (artists view their day, the desk books and settles deposits). The nightly job
-- writes via the service-role client, which bypasses RLS.
alter table public.bookings enable row level security;

drop policy if exists bookings_staff_read on public.bookings;
create policy bookings_staff_read on public.bookings for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk'));

drop policy if exists bookings_artist_read on public.bookings;
create policy bookings_artist_read on public.bookings for select
  using (public.my_role() = 'artist' and artist_id = public.my_artist());

drop policy if exists bookings_staff_write on public.bookings;
create policy bookings_staff_write on public.bookings for all
  using (public.my_role() in ('owner','bookkeeper','frontdesk'))
  with check (public.my_role() in ('owner','bookkeeper','frontdesk'));

-- ── Cross-feature seam: the deferred clients_artist_read policy ──
-- clients-schema.sql left this commented "add it when STARTER-2-BOOKINGS lands"
-- because it depends on `bookings` existing. It belongs here (append-only — we
-- define a new policy on clients, we do not edit the clients schema file): an
-- artist may read the clients they actually have a booking with.
drop policy if exists clients_artist_read on public.clients;
create policy clients_artist_read on public.clients for select
  using (public.my_role() = 'artist' and exists (
    select 1 from public.bookings b
    where b.client_id = clients.id and b.artist_id = public.my_artist()
  ));
