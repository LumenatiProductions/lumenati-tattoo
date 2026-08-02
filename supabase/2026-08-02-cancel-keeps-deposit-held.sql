-- 2026-08-02 deep-logic pass: a CANCEL no longer labels a held deposit
-- "refunded" (Scott's call). No money moves on a cancel — the shop still
-- holds the deposit — so the books must not claim a refund happened. The
-- only writer of 'refunded' is now an actual refund (the payments refund
-- path / Stripe-dashboard webhook, via reverseRefundBooks).
-- This updates the artist-app guard trigger to match the admin API.

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
    -- same way the admin API does. Cancelled keeps a held deposit HELD.
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
        end if;
        -- cancelled: deposit_status stays 'held' on purpose.
      end if;
    end;
  end if;
  return new;
end
$$;

notify pgrst, 'reload schema';
