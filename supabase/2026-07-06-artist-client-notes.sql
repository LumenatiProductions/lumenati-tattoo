-- Lumenati — client memory for artists (2026-07-06). The artist's private
-- notebook about their own people: placement, style, skin quirks, what you
-- talked about last time. One row per (artist, client) — deliberately NOT a
-- column on clients, so two artists who share a client never stomp each
-- other's notes and the desk's CRM notes stay separate.
--
-- Reads of the client list itself already scope by RLS (clients_artist_read:
-- an artist sees only people they have a booking with).
--
-- Run via the Management API, then: notify pgrst, 'reload schema';

create table if not exists public.artist_client_notes (
  artist_id  text not null references public.artists(id) on delete cascade,
  client_id  text not null references public.clients(id) on delete cascade,
  note       text not null default '',
  updated_at timestamptz not null default now(),
  shop_id    uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id),
  primary key (artist_id, client_id)
);

create index if not exists artist_client_notes_shop_idx on public.artist_client_notes (shop_id);

alter table public.artist_client_notes enable row level security;

-- The artist owns their notebook; the desk can read (owner sees the shop).
drop policy if exists client_notes_artist_all on public.artist_client_notes;
create policy client_notes_artist_all on public.artist_client_notes for all
  using (public.my_role() = 'artist' and artist_id = public.my_artist())
  with check (public.my_role() = 'artist' and artist_id = public.my_artist());

drop policy if exists client_notes_staff_read on public.artist_client_notes;
create policy client_notes_staff_read on public.artist_client_notes for select
  using (public.my_role() in ('owner','bookkeeper','frontdesk'));
