-- Lumenati — staff/artist auth allowlist
-- Run in the Supabase SQL editor after schema.sql.
-- Magic-link auth: a user can only use the dashboard if their email has a row
-- here. role gates what they see; artist_id ties an artist to their room.

create table if not exists public.profiles (
  email      text primary key,
  role       text not null check (role in ('owner','bookkeeper','artist','frontdesk')),
  artist_id  text references public.room_content(artist_id) on delete set null,
  full_name  text,
  created_at timestamptz not null default now()
);

-- Owner check as SECURITY DEFINER so the policy doesn't recurse on profiles.
create or replace function public.is_owner()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where email = auth.email() and role = 'owner'
  );
$$;
grant execute on function public.is_owner() to anon, authenticated;

alter table public.profiles enable row level security;

-- A user can read their own row; owners can read everyone.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (email = auth.email() or public.is_owner());

-- Only owners manage the allowlist (add/update/remove team members).
drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_owner_write on public.profiles
  for all using (public.is_owner()) with check (public.is_owner());

-- Seed the first owner so there's someone who can add everyone else.
insert into public.profiles (email, role, full_name)
values ('lumenati@icloud.com', 'owner', 'Lumenati Owner')
on conflict (email) do nothing;
