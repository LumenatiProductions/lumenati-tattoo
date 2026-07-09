-- 2026-07-09 one-tap close-out part 2: cash lives in the app (page-walk 12).
-- Reality being replaced: artist collects cash -> hands to J.D. -> J.D.
-- records -> someone punches it in. New flow: the artist logs cash at the
-- chair (the close-out), the app knows who is physically holding it, and the
-- handoff is two taps — artist "handed off", admin "got it". Whole amount
-- goes to the shop; payroll artists are paid through Gusto (Scott, 07-09).

-- ── cash_entries: who holds the money, and the two-tap handoff ──
alter table public.cash_entries
  add column if not exists booking_id text references public.bookings(id) on delete set null,
  add column if not exists rent_invoice_id uuid references public.rent_invoices(id) on delete set null,
  add column if not exists handed_off_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists received_by text,
  add column if not exists photo_path text;

-- ── artists see and move THEIR OWN cash lines ──
create policy "cash_entries_artist_read" on public.cash_entries
  for select to authenticated
  using (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (shop_id = (select current_shop_id()))
  );

create policy "cash_entries_artist_update" on public.cash_entries
  for update to authenticated
  using (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (shop_id = (select current_shop_id()))
  )
  with check (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (shop_id = (select current_shop_id()))
  );

-- The only move an artist has is "I handed it off" — once, forward-only.
-- Everything else on the row is pinned (amounts and receive/reconcile state
-- belong to the server and admins).
create or replace function public.cash_entries_artist_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  want_handed timestamptz := new.handed_off_at;
begin
  if public.my_role() = 'artist' then
    new := old;
    if want_handed is not null and old.handed_off_at is null then
      new.handed_off_at := want_handed;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists cash_entries_artist_guard on public.cash_entries;
create trigger cash_entries_artist_guard
  before update on public.cash_entries
  for each row execute function public.cash_entries_artist_guard();

-- ── note 8 leftover: the app Follow-ups screen scopes to the artist's OWN
-- clients. Read + the same bump/skip updates admins have, but only rows tied
-- to their own bookings.
create policy "followups_artist_read" on public.followups
  for select to authenticated
  using (
    (my_role() = 'artist'::text)
    and (shop_id = (select current_shop_id()))
    and exists (
      select 1 from public.bookings b
      where b.id = followups.booking_id and b.artist_id = my_artist()
    )
  );

create policy "followups_artist_update" on public.followups
  for update to authenticated
  using (
    (my_role() = 'artist'::text)
    and (shop_id = (select current_shop_id()))
    and exists (
      select 1 from public.bookings b
      where b.id = followups.booking_id and b.artist_id = my_artist()
    )
  )
  with check (
    (my_role() = 'artist'::text)
    and (shop_id = (select current_shop_id()))
    and exists (
      select 1 from public.bookings b
      where b.id = followups.booking_id and b.artist_id = my_artist()
    )
  );

notify pgrst, 'reload schema';
