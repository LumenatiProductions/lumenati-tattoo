# Starter: Clients (CRM)

Read `BUILD-PLAN.md` first. Wave 1. Depends on nothing (no FK parents). Many
later features FK to `clients`, so this is foundational — build it early.

## The idea in one line

One record per person who walks in: contact info, the pieces they've gotten,
which artist, deposit history, and notes. Tattoo shops run on repeat clients and
referrals; right now that memory lives in artists' heads and Square.

## What exists to build on

- Square already stores customer data. Mirror it the way `sales` is mirrored
  from Square (`lib/square/sync.ts`, `app/api/square/sync`). A nightly pull
  keeps `clients` fresh; staff can also add/edit by hand.
- Reuse the auth/RLS/provider patterns per BUILD-PLAN.

## Data model

```
clients (
  id text primary key,              -- square customer id, or generated for walk-ins
  square_customer_id text,          -- null for manually added
  first_name text, last_name text,
  email text, phone text,
  instagram text,                   -- so a client can be linked to a social_posts credit
  birthdate date,                   -- age check + birthday outreach
  notes text default '',
  preferred_artist_id text references public.artists(id) on delete set null,
  total_spent_cents int default 0,  -- rolled up from sales (denormalized, refreshed by job)
  first_seen date, last_seen date,
  created_at timestamptz default now(),
  synced_at timestamptz default now()
)
```
RLS: owner/bookkeeper/frontdesk read+write; artists read clients tied to their
own bookings (refine once `bookings` exists). Cron writes via service role.

## Owned files

`app/admin/(app)/clients/` · `app/api/clients/` (GET list/search, POST/PATCH
upsert, optional `/api/clients/sync`) · `lib/admin/clients-context.tsx` ·
`supabase/clients-schema.sql` · `runDailyJob` = pull Square customers + refresh
`total_spent_cents`/`last_seen` from `sales`.

## Page sketch

Searchable list (name/phone/email), a detail drawer per client showing their
pieces (from `bookings`/`sales` once linked), spend, and editable notes. Stats:
total clients, new this month, returning rate.

## Phases

1. Table + manual add/edit + searchable list.
2. Square customer sync (nightly via ops route).
3. Link to bookings/sales for per-client history + spend rollup.
4. Birthday / lapsed-client outreach list (feeds Follow-ups).

## External needs from Scott

Nothing to start (manual + Square). Square customer read scope on the existing
token covers the sync.
