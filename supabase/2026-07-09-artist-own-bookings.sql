-- 2026-07-09 artist-driven audit part 2: artists close out their OWN bookings.
-- Extends the artist-cancel machinery so an artist can also mark their own
-- scheduled booking completed or no_show from the app (no admin needed —
-- there is no front desk). Same belt-and-suspenders shape as before:
--   * RLS row policy: only their own scheduled bookings, only to one of the
--     three terminal statuses, only inside their shop.
--   * BEFORE UPDATE guard trigger: pins every other column (new := old) and
--     cascades the deposit exactly like the admin API does:
--       completed -> held deposit APPLIED
--       no_show   -> held deposit FORFEITED
--       cancelled -> held deposit REFUNDED

alter policy "bookings_artist_cancel" on public.bookings rename to "bookings_artist_update";

alter policy "bookings_artist_update" on public.bookings
  using (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (status = 'scheduled'::text)
    and (shop_id = (select current_shop_id()))
  )
  with check (
    (my_role() = 'artist'::text)
    and (artist_id = my_artist())
    and (status = any (array['cancelled'::text, 'completed'::text, 'no_show'::text]))
    and (shop_id = (select current_shop_id()))
  );

create or replace function public.bookings_artist_cancel_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() = 'artist' then
    if old.status <> 'scheduled'
       or new.status is distinct from 'cancelled'
          and new.status is distinct from 'completed'
          and new.status is distinct from 'no_show' then
      raise exception 'Artists can only complete, no-show, or cancel their own scheduled bookings';
    end if;
    -- Pin everything except the transition itself; cascade the deposit the
    -- same way the admin API does.
    declare
      wanted text := new.status;
    begin
      new := old;
      new.status := wanted;
      if old.deposit_status = 'held' then
        if wanted = 'completed' then
          new.deposit_status := 'applied';
        elsif wanted = 'no_show' then
          new.deposit_status := 'forfeited';
        else
          new.deposit_status := 'refunded';
        end if;
      end if;
    end;
  end if;
  return new;
end
$$;

notify pgrst, 'reload schema';
