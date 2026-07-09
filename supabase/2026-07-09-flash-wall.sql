-- 2026-07-09 the flash wall goes live (page-walk item 5, last piece).
-- Artists pin flash from the app; the public /flash-wall corkboard renders
-- real pieces. Brand-new table with its own walls — same shape as every
-- other tenant table (shop wall + artist-owns-their-rows).

create table if not exists public.flash_pieces (
  id uuid primary key default gen_random_uuid(),
  artist_id text not null references public.artists(id),
  shop_id uuid not null references public.shops(id),
  src text not null,
  title text not null default '',
  price_cents integer not null default 0,
  status text not null default 'available' check (status in ('available', 'claimed')),
  created_at timestamptz not null default now()
);

alter table public.flash_pieces enable row level security;

-- The wall is public — anyone can browse the flash.
create policy "flash_public_read" on public.flash_pieces
  for select to anon, authenticated using (true);

-- Artists pin/edit/pull their own pieces.
create policy "flash_artist_write" on public.flash_pieces
  for all to authenticated
  using ((my_role() = 'artist'::text) and (artist_id = my_artist()) and (shop_id = (select current_shop_id())))
  with check ((my_role() = 'artist'::text) and (artist_id = my_artist()) and (shop_id = (select current_shop_id())));

-- Admins curate anything in their shop.
create policy "flash_admin_write" on public.flash_pieces
  for all to authenticated
  using ((my_role() = 'owner'::text) and (shop_id = (select current_shop_id())))
  with check ((my_role() = 'owner'::text) and (shop_id = (select current_shop_id())));

-- Inserts stamp the writer's shop like every other tenant table.
drop trigger if exists set_shop_id on public.flash_pieces;
create trigger set_shop_id before insert on public.flash_pieces
  for each row execute function public.set_shop_id();

notify pgrst, 'reload schema';
