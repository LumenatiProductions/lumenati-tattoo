import { supabase } from "./supabase";

const HOUR_MS = 3_600_000;

// Same double-booking guard the web API runs, client-side (the app writes
// bookings directly under RLS). Returns the clashing start time, or null.
// Shared by the Bookings screen and the rebook card on the paid screen.
export async function findClash(
  artistId: string,
  startsAt: string,
  endsAt: string | null,
  excludeId?: string,
): Promise<string | null> {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return null;
  const end = endsAt ? new Date(endsAt).getTime() : start + HOUR_MS;
  const windowMs = 12 * HOUR_MS;
  const { data } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at")
    .eq("artist_id", artistId)
    .eq("status", "scheduled")
    .gte("starts_at", new Date(start - windowMs).toISOString())
    .lte("starts_at", new Date(end + windowMs).toISOString());
  for (const r of (data ?? []) as { id: string; starts_at: string; ends_at: string | null }[]) {
    if (excludeId && r.id === excludeId) continue;
    const s2 = new Date(r.starts_at).getTime();
    const e2 = r.ends_at ? new Date(r.ends_at).getTime() : s2 + HOUR_MS;
    if (start < e2 && s2 < end) return r.starts_at;
  }
  return null;
}
