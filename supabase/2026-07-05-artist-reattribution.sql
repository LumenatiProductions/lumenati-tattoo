-- Lumenati — self-serve Square history linking (2026-07-05)
-- Adding an artist happens on the Artists & Pay page, but attaching their old
-- Square sales was a by-hand DB job. This makes it one call from the page.
--
-- Principle: the LEDGER stays append-only for money (amounts, dates, kinds,
-- reversals are frozen forever) — but artist_id is ATTRIBUTION metadata, not
-- money. Correcting who a sale belongs to must not require rewriting 2,400
-- reversing rows. So the block-mutate trigger now permits updates that change
-- artist_id and nothing else.

begin;

-- 1. Append-only trigger, with the attribution exception.
create or replace function public.ledger_no_mutate() returns trigger
  language plpgsql as $$
begin
  if TG_OP = 'UPDATE'
    and new.id is not distinct from old.id
    and new.shop_id is not distinct from old.shop_id
    and new.occurred_at is not distinct from old.occurred_at
    and new.created_at is not distinct from old.created_at
    and new.created_by is not distinct from old.created_by
    and new.source is not distinct from old.source
    and new.kind is not distinct from old.kind
    and new.direction is not distinct from old.direction
    and new.amount_cents is not distinct from old.amount_cents
    and new.currency is not distinct from old.currency
    and new.client_id is not distinct from old.client_id
    and new.booking_id is not distinct from old.booking_id
    and new.external_id is not distinct from old.external_id
    and new.reverses is not distinct from old.reverses
    and new.note is not distinct from old.note
  then
    return new; -- only artist_id changed: attribution fix, allowed
  end if;
  raise exception 'ledger is append-only; insert a reversing row instead (only artist_id may be corrected)';
end $$;

-- 2. One call links a Square team member to an artist and re-attributes their
-- whole history: the team map (future syncs), the sales rows, and the ledger
-- rows those sales produced. p_artist_id null unlinks (history -> shop).
-- Owner-gated inside the function; security definer so it can touch the ledger.
create or replace function public.link_square_history(p_square_id text, p_artist_id text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  -- IS DISTINCT FROM: a missing role (null) must fail closed, and `null <>
  -- 'owner'` evaluates to null which would silently skip the raise.
  if public.my_role() is distinct from 'owner' then
    raise exception 'owners only';
  end if;
  if p_artist_id is not null and not exists (select 1 from public.artists a where a.id = p_artist_id) then
    raise exception 'no such artist';
  end if;

  update public.square_team_members set artist_id = p_artist_id where square_id = p_square_id;

  update public.sales set artist_id = p_artist_id where team_member_id = p_square_id;
  get diagnostics n = row_count;

  update public.ledger l set artist_id = p_artist_id
  from public.sales s
  where s.team_member_id = p_square_id
    and l.external_id in ('sale_' || s.id || '_svc', 'sale_' || s.id || '_tip');

  return n;
end $$;

grant execute on function public.link_square_history(text, text) to authenticated;

commit;
