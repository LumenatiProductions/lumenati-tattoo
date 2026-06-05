# Starter: Social Feed Automation

A starter prompt for the next build session. Goal: an area in the command
center that pulls in ALL the artists' social feeds and automates the shop's own
social presence (aggregate the best artist work, queue it, and post it on a
schedule across the roster).

## The idea in one line

Every artist already posts their own work. The shop should not have to manually
re-share it. Pull every artist's feed into one place, let an owner curate, and
auto-post a steady, balanced stream to the shop's accounts (and optionally a
live wall on the public site).

## What already exists to build on

- Roster lives in Supabase `artists` (each row has `handle` = their Instagram
  handle, plus `color`, `slug`, `active`). Read it with `fetchArtists()` /
  `useArtists()`.
- The command center pattern is established and should be copied here:
  - Server-only API routes for anything touching tokens (see `/api/rent`,
    `/api/square/sync`, `/api/digest`).
  - Client provider + page for display (see `rent-context.tsx` + `/admin/rent`).
  - Role-gated nav item in `components/admin/AdminShell.tsx`.
  - Supabase tables with RLS; service-role client (`lib/supabase/admin.ts`) for
    session-less cron writes.
  - Vercel cron in `vercel.json` for scheduled jobs (note: the current plan
    caps cron at once per day; a daily cron can still drain a queue of items
    scheduled throughout that day).
  - Resend is wired for email if notifications are wanted.

## The hard decision: how to read the feeds

You cannot pull arbitrary Instagram accounts from an API without access. Pick
one of these before building Phase 1. List the tradeoff to Scott and let him
choose:

1. Instagram Graph API (official). Each artist's account must be a Business or
   Creator account linked to a Facebook Page, and the shop needs a Meta
   developer app plus a long-lived token per connected artist. Most robust and
   ToS-clean, but every artist has to connect once.
2. Third-party aggregator (Behold.so, EmbedSocial, Juicer, Curator.io). They
   handle the Instagram plumbing and hand back a feed via API or embed. Fastest
   path, small monthly cost, less control.
3. Hashtag / mention based. Pull posts tagged with a shop hashtag (e.g.
   #lumenati) or that @-mention the shop, via the Graph API Hashtag Search on
   the shop's own business account. No per-artist connection, but only catches
   posts the artist tags.
4. Manual submit (low-tech fallback). Artists paste post URLs; the shop renders
   them via oEmbed and curates. No API at all. Good stopgap.

Do not scrape Instagram HTML: it breaks constantly and violates their terms.

## Publishing back out

- Posting to the shop's own Instagram uses the Graph API Content Publishing
  endpoints (shop Business account, single image / carousel / reel). Rate limit
  is roughly 25 posts per day.
- Other channels (TikTok, Facebook, X) each need their own API and app. Scope to
  Instagram first; leave the others as a later add.
- Reposting an artist's work should carry credit (tag the artist). The artists
  are the shop's own crew, so a blanket permission is reasonable, but confirm it.

## Suggested phases

- Phase 1, Aggregated wall (read only). Pull each active artist's recent posts
  into one "Social" page in the command center. Optionally expose a live feed
  block on the public Y2K site.
- Phase 2, Curate and queue. Select posts, write or tweak a caption, and add to
  a shop posting queue with a scheduled time.
- Phase 3, Auto-publish. A cron drains the queue and posts to the shop's
  Instagram. Rotate evenly across the roster so every artist gets featured.
- Phase 4, Smart lineup. Auto-suggest a weekly schedule (for example one post
  per artist per week), pick reasonable post times, balance the roster, and draft
  captions. Email or dashboard summary of what is queued.

## Data model sketch

- `social_accounts` (artist_id, platform, handle, access_token, token_expires_at,
  connected_at) - per-artist connection, if going the official route.
- `social_posts` (id, artist_id, platform, external_id, media_url, media_type,
  permalink, caption, posted_at, fetched_at) - pulled artist content.
- `social_queue` (id, source_post_id, media_url, caption, channels, scheduled_for,
  status, published_at, result) - what the shop will post.

Mirror the RLS approach used by `sales`: owner/marketing read and write, cron
writes via service role.

## Integration points

- New nav item "Social" in `AdminShell.tsx` (roles: owner, plus a marketing or
  front-desk role if wanted).
- `/api/social/feeds` (pull + cache artist posts), `/api/social/publish` (push a
  queued item), both server-side with the platform tokens.
- A `SocialProvider` + `/admin/social` page following the rent/sales pattern.
- Cron entries in `vercel.json`: one to refresh feeds, one to drain the publish
  queue.

## Confirm with Scott before building

- Which feed-access route above (official Graph API, aggregator, hashtag, or
  manual)?
- Does the shop have an Instagram Business account and a Meta developer app, or
  should we use an aggregator to skip that?
- Which channels to auto-post to (Instagram only to start)?
- Cadence and style (how many posts per day, feed vs stories, one per artist
  per week)?
- Auto-publish, or approve-then-publish with a human in the loop?
- Also show a live aggregated wall on the public website, or command center only?

## External setup this will need from Scott

Like the Resend domain and the Square token, this feature needs real platform
credentials before it can go live: a Meta developer app and Instagram Business
account (official route), or an aggregator account (aggregator route). Build the
UI and data flow against those once chosen; do not block on them for the schema
and the read-only wall.
