# Supabase setup

The command center's room editor and the (future) data-driven public rooms read
and write room content from Supabase. Until the env vars below are set, the app
transparently falls back to mock/localStorage data — so local dev works with or
without Supabase.

## 1. Create the project

Org **Lumenati tattoo** already exists. In it, create a project (name it
`lumenati-tattoo`), generate a strong DB password, region Americas, keep the
Data API enabled.

## 2. Run the schema

Supabase Dashboard → **SQL** → New query → paste all of `supabase/schema.sql` →
Run. This creates the `room_content` table (seeded with the 6 artists), RLS
policies, and the public `room-photos` Storage bucket.

> Note: the write policies are intentionally OPEN for now (no auth yet, same as
> the current localStorage version). They get locked to authenticated artists
> editing only their own room when we add Supabase Auth.

## 3. Wire the keys

Dashboard → **Project Settings → API**. Copy:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Local: copy `.env.local.example` to `.env.local` and paste them in.

Vercel (so production uses the DB):

```
vercel env add NEXT_PUBLIC_SUPABASE_URL production --scope cinebody
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --scope cinebody
```

(or add them in the Vercel dashboard → Project → Settings → Environment
Variables). Redeploy after adding.

## 4. Verify

With the env vars set, the **My Room** editor reads/writes the DB and photo
uploads go to Storage. Without them, it stays on mock data. No code change
needed to flip between the two.
