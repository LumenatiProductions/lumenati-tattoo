-- Lumenati — Multi-shop foundation ("the seam"), Milestone 2 (2026-07-02)
-- Run in the Supabase SQL editor or via the Management API. Idempotent.
--
-- Goal: make "which shop owns this row" a first-class concept WITHOUT changing
-- anything for the single Lumenati shop today. Every tenant table gets a
-- shop_id defaulted to Lumenati (existing rows backfill, every existing insert
-- keeps working untouched). RLS is NOT yet scoped by shop_id (single shop, no
-- benefit, and rewriting 26 tables' policies now adds risk); when a 2nd shop
-- arrives the data is already tagged, so it becomes a policy-only change.

begin;

create table if not exists public.shops (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.shops enable row level security;
drop policy if exists shops_read on public.shops;
create policy shops_read on public.shops for select to authenticated using (true);
drop policy if exists shops_owner_write on public.shops;
create policy shops_owner_write on public.shops for all
  using (public.is_owner()) with check (public.is_owner());

-- The one shop today. Fixed id so it can be the column default everywhere.
insert into public.shops (id, slug, name)
values ('11111111-1111-1111-1111-111111111111', 'lumenati', 'Lumenati Tattoo')
on conflict (slug) do nothing;

-- Tag every tenant table. NOT NULL DEFAULT backfills existing rows + keeps all
-- current inserts working (they simply omit shop_id and get Lumenati).
alter table public.artist_expenses add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists artist_expenses_shop_idx on public.artist_expenses(shop_id);
alter table public.artist_goals add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists artist_goals_shop_idx on public.artist_goals(shop_id);
alter table public.artists add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists artists_shop_idx on public.artists(shop_id);
alter table public.booking_requests add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists booking_requests_shop_idx on public.booking_requests(shop_id);
alter table public.bookings add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists bookings_shop_idx on public.bookings(shop_id);
alter table public.cash_entries add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists cash_entries_shop_idx on public.cash_entries(shop_id);
alter table public.cash_sessions add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists cash_sessions_shop_idx on public.cash_sessions(shop_id);
alter table public.clients add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists clients_shop_idx on public.clients(shop_id);
alter table public.compliance_items add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists compliance_items_shop_idx on public.compliance_items(shop_id);
alter table public.consent_forms add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists consent_forms_shop_idx on public.consent_forms(shop_id);
alter table public.device_tokens add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists device_tokens_shop_idx on public.device_tokens(shop_id);
alter table public.expenses add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists expenses_shop_idx on public.expenses(shop_id);
alter table public.followup_templates add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists followup_templates_shop_idx on public.followup_templates(shop_id);
alter table public.followups add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists followups_shop_idx on public.followups(shop_id);
alter table public.healed_photos add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists healed_photos_shop_idx on public.healed_photos(shop_id);
alter table public.inventory_items add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists inventory_items_shop_idx on public.inventory_items(shop_id);
alter table public.inventory_log add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists inventory_log_shop_idx on public.inventory_log(shop_id);
alter table public.payments add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists payments_shop_idx on public.payments(shop_id);
alter table public.profiles add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists profiles_shop_idx on public.profiles(shop_id);
alter table public.rent_invoices add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists rent_invoices_shop_idx on public.rent_invoices(shop_id);
alter table public.room_content add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists room_content_shop_idx on public.room_content(shop_id);
alter table public.sales add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists sales_shop_idx on public.sales(shop_id);
alter table public.settlements add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists settlements_shop_idx on public.settlements(shop_id);
alter table public.social_posts add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists social_posts_shop_idx on public.social_posts(shop_id);
alter table public.square_sync add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists square_sync_shop_idx on public.square_sync(shop_id);
alter table public.square_team_members add column if not exists shop_id uuid not null default '11111111-1111-1111-1111-111111111111' references public.shops(id);
create index if not exists square_team_members_shop_idx on public.square_team_members(shop_id);

-- Resolve the caller's shop (their profiles.shop_id; defaults to Lumenati).
-- Defined after the ALTERs so profiles.shop_id exists when the body is parsed.
create or replace function public.current_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select shop_id from public.profiles where email = auth.email() limit 1),
    '11111111-1111-1111-1111-111111111111'::uuid
  );
$$;
grant execute on function public.current_shop_id() to anon, authenticated;

commit;
