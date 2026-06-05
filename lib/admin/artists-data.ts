import { getSupabase } from "@/lib/supabase";
import { ARTISTS as FALLBACK } from "./mock-data";
import type { Artist } from "./types";

// DB row -> Artist. The `artists` table is the live roster; the static ARTISTS
// array is only a fallback when Supabase isn't reachable.
type Row = {
  id: string;
  slug: string;
  name: string;
  handle: string;
  color: string;
  pay_type: "rent" | "split" | "hybrid";
  rent_cents: number;
  split_pct: number | string;
  guest: boolean;
  active: boolean;
  room_extras: boolean;
};

export function rowToArtist(r: Row): Artist {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    handle: r.handle,
    color: r.color,
    active: r.active,
    guest: r.guest,
    roomExtras: r.room_extras,
    pay: { type: r.pay_type, rentCents: r.rent_cents, shopSplitPct: Number(r.split_pct) },
    squareTeamMemberId: null,
  };
}

/** Active roster, ordered. Falls back to the static list if the DB is empty/unreachable. */
export async function fetchArtists(): Promise<Artist[]> {
  const sb = getSupabase();
  if (!sb) return FALLBACK;
  const { data, error } = await sb
    .from("artists")
    .select("*")
    .eq("active", true)
    .order("sort");
  if (error || !data || !data.length) return FALLBACK;
  return (data as Row[]).map(rowToArtist);
}

/** One artist by public slug (for the room route). */
export async function fetchArtistBySlug(slug: string): Promise<Artist | null> {
  const sb = getSupabase();
  if (!sb) return FALLBACK.find((a) => a.slug === slug) ?? null;
  const { data } = await sb.from("artists").select("*").eq("slug", slug).maybeSingle();
  return data ? rowToArtist(data as Row) : null;
}
