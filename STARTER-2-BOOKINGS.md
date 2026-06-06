# Starter: Bookings (appointments + deposits + no-shows)

Read `BUILD-PLAN.md` first. Wave 2. FKs to `clients` and `artists`. The
highest-leverage feature: it's the daily-use surface and where money leaks.

## The idea in one line

An internal calendar of who's booked with which artist and when, with the part
that actually matters for a tattoo shop: **deposit tracking** (taken -> applied
to the final ticket, or forfeited on a no-show) and a no-show/forfeit history
per client.

## What exists to build on

- There's a public `/book` page already (booking requests). This feature is the
  staff-side calendar those requests land in.
- Square Appointments has an API; mirror it like `sales` (nightly pull). Staff
  can also create/edit appointments by hand.
- Deposits are just Square payments/invoices tagged to a booking — relate them,
  don't reinvent.

## Data model

```
bookings (
  id text primary key,                 -- square appointment id, or generated
  square_appointment_id text,
  client_id text references public.clients(id) on delete set null,
  artist_id text references public.artists(id) on delete set null,
  starts_at timestamptz, ends_at timestamptz,
  status text default 'scheduled',     -- scheduled | completed | no_show | cancelled
  service_desc text default '',
  est_price_cents int,
  deposit_cents int default 0,
  deposit_status text default 'none',  -- none | held | applied | forfeited | refunded
  deposit_payment_id text,             -- square payment id for the deposit
  sale_id text references public.sales(id) on delete set null, -- final ticket once done
  notes text default '',
  source text default 'manual',        -- manual | square | web_request
  created_at timestamptz default now(),
  synced_at timestamptz default now()
)
```
Indexes on `starts_at`, `artist_id`, `client_id`, `status`. RLS:
owner/bookkeeper/frontdesk all; an artist sees only their own bookings
(`artist_id = my_artist()`). Cron writes via service role.

## Owned files

`app/admin/(app)/bookings/` · `app/api/bookings/` (GET range/list, POST/PATCH,
status transitions, optional `/sync`) · `lib/admin/bookings-context.tsx` ·
`supabase/bookings-schema.sql` · `runDailyJob` = pull Square appointments +
auto-flag past `scheduled` as `no_show` for review.

## Page sketch

Day/week view (or a clean agenda list — match the rent/sales list aesthetic
before reaching for a calendar grid). Per booking: client, artist (color dot),
time, deposit badge (held/applied/forfeited), status. Quick actions: mark
completed (link the sale), mark no-show (forfeit deposit), reschedule. Stats:
today's count, upcoming deposits held, no-show rate, forfeited-deposit total.

Expose `useBookings().today` and `.depositsHeld` for the Overview tile.

## Phases

1. Table + manual booking CRUD + agenda view + deposit fields.
2. Square Appointments sync (nightly).
3. Deposit lifecycle: link deposit payment, apply to final sale, forfeit on
   no-show; no-show rate per client (reads from `clients`).
4. Web booking requests from `/book` flow into here as `web_request` status.

## External needs from Scott

Confirm deposits run through Square (so we can relate payment ids). If Square
Appointments isn't the booking tool, name what is so the sync targets it.
