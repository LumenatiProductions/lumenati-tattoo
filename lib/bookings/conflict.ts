import type { SupabaseClient } from "@supabase/supabase-js";

// The double-booking guard, shared by every server path that writes a booking
// (/api/bookings and the public waitlist claim). An artist works one client at
// a time; a booking with no end is treated as one hour, same as the week grid.

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export async function findConflict(
  supabase: SupabaseClient,
  artistId: string,
  startsAt: string,
  endsAt: string | null,
  excludeId?: string,
): Promise<{ id: string; startsAt: string } | null> {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return null;
  const end = endsAt ? new Date(endsAt).getTime() : start + DEFAULT_DURATION_MS;
  // ±12h around the new slot covers any realistic session without scanning the book.
  const windowMs = 12 * 60 * 60 * 1000;
  const { data } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at")
    .eq("artist_id", artistId)
    .eq("status", "scheduled")
    .gte("starts_at", new Date(start - windowMs).toISOString())
    .lte("starts_at", new Date(end + windowMs).toISOString());
  for (const row of data ?? []) {
    if (excludeId && row.id === excludeId) continue;
    const s2 = new Date(row.starts_at as string).getTime();
    const e2 = row.ends_at ? new Date(row.ends_at as string).getTime() : s2 + DEFAULT_DURATION_MS;
    if (start < e2 && s2 < end) return { id: row.id as string, startsAt: row.starts_at as string };
  }
  return null;
}
