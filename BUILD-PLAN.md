# Build Plan: the full shop-management platform, built in parallel

Goal: ship seven new command-center features (Bookings, Clients, Intake &
Consent, Compliance, Follow-ups, Inventory, Reports) alongside the existing
modules, with multiple build sessions/agents able to work **at the same time
without colliding**.

This doc is the contract. Every `STARTER-*.md` references it. Read this first.

## The whole map

Booking -> deposit -> consent form -> appointment -> sale (already built) ->
follow-up -> review -> repeat client. We have the back third. These features
fill the front two-thirds plus the compliance and supply layers.

| Feature | Route | Table(s) | Wave | Depends on | Starter |
|---|---|---|---|---|---|
| Clients (CRM) | `/admin/clients` | `clients` | 1 | — (Square customers) | STARTER-CLIENTS.md |
| Compliance | `/admin/compliance` | `compliance_items` | 1 | `artists` | STARTER-COMPLIANCE.md |
| Inventory | `/admin/inventory` | `inventory_items` | 1 | — | STARTER-INVENTORY.md |
| Bookings | `/admin/bookings` | `bookings` | 2 | `clients`, `artists` | STARTER-BOOKINGS.md |
| Intake & Consent | `/admin/intake` | `consent_forms` | 3 | `bookings`, `clients` | STARTER-INTAKE-CONSENT.md |
| Follow-ups | `/admin/followups` | `followups` | 3 | `bookings`, `clients` | STARTER-FOLLOWUPS.md |
| Reports | `/admin/reports` | none (read-only) | 3 | `sales`,`bookings`,`payouts` | STARTER-REPORTS.md |

Waves describe **schema apply order and FK direction only** — all the
application code (routes, pages, contexts) can be written fully in parallel from
day one, because shared files are pre-settled (see below). A later wave's table
may FK to an earlier wave's table; never the reverse. FKs across features are
`on delete set null` so a missing parent never blocks an insert.

## The one rule that prevents collisions: scaffold first

Before any feature work, ONE scaffold commit settles every shared file. After
that commit lands on `main`, **no feature touches a shared file.** Each feature
only creates/edits files inside its own lane.

The scaffold commit (do this first, single owner) pre-wires:

1. **`components/admin/AdminShell.tsx`** — adds ALL seven nav items and ALL
   seven providers at once, in the canonical order below. Pages they point to
   are stubs. This is the file most likely to merge-conflict; settling it once
   removes the risk entirely.
2. **Stub pages** — `app/admin/(app)/<feature>/page.tsx` for each, rendering a
   "Coming soon" placeholder. Each feature later replaces only its own stub.
3. **Stub providers** — `lib/admin/<feature>-context.tsx` exporting a no-op
   provider + hook, so the shell compiles. Each feature fills its own.
4. **`vercel.json`** — adds the single daily ops cron (see Crons below).
5. **`app/api/ops/daily/route.ts`** — the daily fan-out route, pre-importing
   each feature's `runDailyJob` (no-op stubs at first).
6. **`.env.local.example`** — placeholders for any new keys, commented.

After the scaffold, the app builds and deploys green with seven "coming soon"
tabs, and every feature is unblocked to build in isolation.

## Lane rules (what a feature MAY and MAY NOT touch)

A feature OWNS and may freely edit:
- `app/admin/(app)/<feature>/` — its page(s)
- `app/api/<feature>/` — its routes
- `lib/<feature>/` and/or `lib/admin/<feature>-context.tsx` — its logic + provider
- `supabase/<feature>-schema.sql` — its table(s) + RLS
- its own `runDailyJob` implementation (called by the ops route)

A feature MUST NOT edit (these are settled by the scaffold, or owned by the
integration pass):
- `components/admin/AdminShell.tsx` (nav + providers already wired)
- `lib/admin/types.ts` (put feature types in the feature folder, like
  `SocialPost` lives in `social-context.tsx` — do NOT centralize)
- `vercel.json`, `app/api/ops/daily/route.ts` (cron settled; you only implement
  your own job function that it already imports)
- `app/admin/(app)/page.tsx` (the Overview — see Integration pass)
- another feature's schema, route, page, or context

If two features both need a brand-new shared helper, add it in its own new file
under `lib/` (append-only); never edit each other's files.

## Conventions (match the existing modules exactly)

- **Stack:** Next 15 app router, TS, Tailwind 4, `@supabase/ssr`. Money is
  integer **cents**. Dates are ISO strings.
- **Auth in routes:** copy `app/api/rent/route.ts` — `createClient()` ->
  `auth.getUser()` -> read `profiles.role` -> gate. 401 if no user, 403 if role
  not allowed.
- **RLS:** every table `enable row level security`. Reuse the existing
  `SECURITY DEFINER` helpers `public.my_role()`, `public.my_artist()`,
  `public.is_owner()` (defined in `square-schema.sql` / `auth-schema.sql`).
  **Never redefine them.** Pattern: staff read by role; owner/bookkeeper write;
  cron writes via the service-role client (`lib/supabase/admin.ts`), which
  bypasses RLS.
- **Provider + page:** copy the `rent-context.tsx` + `/admin/rent/page.tsx`
  pair, or the richer `social-context.tsx` (has mutations) when the feature
  writes data.
- **UI:** only `components/admin/ui.tsx` (`Card`, `StatCard`, `SectionTitle`,
  `Badge`, `Dot`, `MockBanner`). No new UI library.
- **Roster:** `useArtists()` / `fetchArtists()` for the artist list/picker.
- **Tables:** singular-domain plural names, no feature prefix needed since the
  schema files keep them separate (`bookings`, `clients`, etc.).

## Canonical nav + provider order (scaffold writes this)

Nav (insert the new items in this position, roles as shown):
```
Overview, My Room, Artists & Pay, Payouts, Booth Rent, Cash Log,
Bookings (owner,frontdesk,artist), Clients (owner,frontdesk),
Intake (owner,frontdesk), Social (owner,frontdesk),
Inventory (owner,frontdesk), Compliance (owner), Reports (owner,bookkeeper),
Staff, Integrations
```
Provider nesting order (outermost -> innermost), append the new ones inside the
existing stack: Role > Artists > RoomContent > Sales > Rent > Social >
Clients > Bookings > Intake > Compliance > Inventory > Followups.
(Bookings inside Clients so a booking view can read client context, etc.)

## Crons (respect the once-per-day cap)

The plan caps cron frequency, so we use **one** daily cron entry, not one per
feature. `vercel.json` gets a single `/api/ops/daily` at, say, `0 15 * * *`.
That route is CRON_SECRET-gated (copy `app/api/square/sync` GET) and calls each
feature's exported `runDailyJob(admin)` inside its own try/catch, so one
feature's failure never blocks the others. Features that need scheduled work
(Bookings sync, Follow-ups send, Compliance alerts, Inventory alerts) implement
that function in their own lib; the ops route already imports it.

## Overview integration pass (single owner, last)

Several features want a tile on the Overview (today's appointments, expiring
licenses, low stock). To avoid everyone editing `Overview/page.tsx`, each
feature's **provider exposes the aggregate** it wants surfaced (e.g.
`useBookings().today`, `useCompliance().expiringSoon`). A final single-owner
integration pass composes those into the Overview. Until then, each feature is
fully usable on its own page.

## Git strategy

- Scaffold commit lands on `main` first (deploys green).
- Each feature on its own branch or `git worktree` off post-scaffold `main`.
  Because lanes don't overlap, merges back to `main` are conflict-free in any
  order. Apply each feature's schema in Supabase per the wave order before
  merging code that depends on a parent table.
- Run `npm run build` before each merge (production build is stricter than
  `tsc`; catches what a deploy would fail on).

## Definition of done per feature

Schema applied + RLS verified · API gated · page renders empty-state · provider
exposes its Overview aggregate · `runDailyJob` implemented (if applicable) ·
`npm run build` green · starter doc's STATUS block updated.
