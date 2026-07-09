-- 2026-07-09 artist-driven audit part 3: artists run their own intake.
-- An artist can START a consent form for their own client (insert, pinned to
-- their own artist_id) and work their own forms at the chair: confirm the
-- in-person ID check and void mistakes. Same belt-and-suspenders shape as
-- bookings: row policies scope to their own rows, a BEFORE UPDATE guard pins
-- every column except the two allowed transitions.

create policy "consent_forms_artist_insert" on public.consent_forms
  for insert to authenticated
  with check (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (shop_id = (select current_shop_id()))
  );

create policy "consent_forms_artist_update" on public.consent_forms
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

-- Artists may only: (a) confirm the ID check (forward-only, with the id type),
-- (b) void an un-voided form (forward-only; the signing link dies with it).
-- Everything else on the row is pinned.
create or replace function public.consent_forms_artist_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  want_id_checked boolean := new.id_checked;
  want_id_type text := new.id_type;
  want_voided boolean := new.voided;
  want_reason text := new.void_reason;
begin
  if public.my_role() = 'artist' then
    new := old;
    if want_id_checked and not old.id_checked then
      new.id_checked := true;
      new.id_type := want_id_type;
    end if;
    if want_voided and not old.voided then
      new.voided := true;
      new.void_reason := coalesce(want_reason, 'Retracted by artist');
      new.sign_token := null;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists consent_forms_artist_guard on public.consent_forms;
create trigger consent_forms_artist_guard
  before update on public.consent_forms
  for each row execute function public.consent_forms_artist_guard();

notify pgrst, 'reload schema';
