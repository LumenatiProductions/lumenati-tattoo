import { getSupabase } from "@/lib/supabase";

// Public reads for the standard shop template (/s/<shop>). Anon-key reads;
// RLS + column grants decide what's visible. The Y2K root site never touches
// this — it stays hardwired to Lumenati.

export type PublicShop = {
  id: string;
  slug: string;
  name: string;
  template: string;
  accent: string;
  tagline: string;
};
export type PublicArtist = {
  id: string;
  slug: string;
  name: string;
  handle: string;
  color: string;
};

export async function fetchShopBySlug(slug: string): Promise<PublicShop | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("shops")
    .select("id, slug, name, template, accent, tagline")
    .eq("slug", slug)
    .maybeSingle();
  return (data as PublicShop) ?? null;
}

export async function fetchShopArtists(shopId: string): Promise<PublicArtist[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("artists")
    .select("id, slug, name, handle, color")
    .eq("shop_id", shopId)
    .eq("active", true)
    .order("sort");
  return (data ?? []) as PublicArtist[];
}

// artists.slug is globally unique, so non-default shops store
// "<shop>--<artist>"; resolve both spellings within the shop.
export async function fetchShopArtist(shopId: string, shopSlug: string, artistSlug: string): Promise<PublicArtist | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("artists")
    .select("id, slug, name, handle, color")
    .eq("shop_id", shopId)
    .in("slug", [`${shopSlug}--${artistSlug}`, artistSlug])
    .maybeSingle();
  return (data as PublicArtist) ?? null;
}

/** The within-shop slug an artist shows in URLs. */
export const publicArtistSlug = (shopSlug: string, storedSlug: string) =>
  storedSlug.startsWith(`${shopSlug}--`) ? storedSlug.slice(shopSlug.length + 2) : storedSlug;
