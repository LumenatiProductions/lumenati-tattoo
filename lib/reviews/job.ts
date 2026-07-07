import type { SupabaseClient } from "@supabase/supabase-js";

// Daily Google-standing snapshot (review velocity). Runs from the ops fan-out.
// Uses the Places API (key-based) when configured; a no-op with a clear reason
// otherwise, so the desk keeps logging counts by hand on Reports until Scott
// adds the key. One row per day; re-running a day just refreshes it.
//
// Env: GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID (the shop's place id).

export const isPlacesConfigured = !!(process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACE_ID);

export async function runDailyJob(admin: unknown) {
  const client = admin as SupabaseClient;
  if (!isPlacesConfigured) return { skipped: "GOOGLE_PLACES_API_KEY / GOOGLE_PLACE_ID not set" };

  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const placeId = process.env.GOOGLE_PLACE_ID!;
  // Places API (New): field-masked GET, returns rating + userRatingCount.
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount" },
  });
  if (!res.ok) return { error: `Places API ${res.status}` };
  const d = (await res.json()) as { rating?: number; userRatingCount?: number };
  if (typeof d.userRatingCount !== "number") return { error: "Places API returned no review count" };

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await client.from("review_snapshots").upsert({
    captured_on: today,
    rating: d.rating ?? null,
    review_count: d.userRatingCount,
    source: "places",
  });
  if (error) return { error: error.message };
  return { captured: today, rating: d.rating, count: d.userRatingCount };
}
