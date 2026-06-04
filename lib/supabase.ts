import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public config — anon key is safe in the browser. Until both are set the app
// transparently falls back to mock/localStorage (see lib/admin/room-data.ts).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let _client: SupabaseClient | null = null;

/** Returns a Supabase client, or null when env vars aren't configured yet. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_client) _client = createClient(url!, anonKey!);
  return _client;
}

export const ROOM_PHOTOS_BUCKET = "room-photos";
