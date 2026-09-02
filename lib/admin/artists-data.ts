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
  // Private business terms — only present on authenticated (staff) reads. The
  // public/anon key can no longer read these columns (see security-lockdown.sql),
  // so public reads omit them and they arrive undefined.
  pay_type?: "payroll_salary" | "payroll_split" | "booth_rent";
  rent_cents?: number;
  split_pct?: number | string;
  guest: boolean;
  active: boolean;
  room_extras: boolean;
};

// Columns the public/anon key is allowed to read. Sensitive pay columns are
// deliberately excluded so `select *` never trips the column-level lockdown.
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

const PUBLIC_COLS = "id,slug,name,handle,color,guest,active,room_extras,sort";

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
    pay: {
      type: r.pay_type ?? "payroll_split",
      rentCents: r.rent_cents ?? 0,
      shopSplitPct: r.split_pct == null ? 0 : Number(r.split_pct),
    },
    squareTeamMemberId: null,
  };
}

/** Active roster, ordered. Falls back to the static list if the DB is empty/unreachable. */
export async function fetchArtists(): Promise<Artist[]> {
  const sb = getSupabase();
  if (!sb) return FALLBACK;
  const { data, error } = await sb
    .from("artists")
    .select(PUBLIC_COLS)
    // The Y2K site is Lumenati's own; other shops' artists live at /s/<shop>.
    // Without this the demo tenant's artists landed on the homepage (9/2).
    .eq("shop_id", LUMENATI_SHOP_ID)
    .eq("active", true)
    .order("sort");
  if (error || !data || !data.length) return FALLBACK;
  return (data as Row[]).map(rowToArtist);
}

/** One artist by public slug (for the room route). */
export async function fetchArtistBySlug(slug: string): Promise<Artist | null> {
  const sb = getSupabase();
  if (!sb) return FALLBACK.find((a) => a.slug === slug) ?? null;
  const { data } = await sb.from("artists").select(PUBLIC_COLS).eq("slug", slug).maybeSingle();
  return data ? rowToArtist(data as Row) : null;
}
