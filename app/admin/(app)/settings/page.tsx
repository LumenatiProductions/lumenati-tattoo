import { createClient } from "@/lib/supabase/server";
import { isSquareConfigured } from "@/lib/square/client";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import { fetchArtists } from "@/lib/admin/artists-data";
import SettingsTabs, { type SquareProps } from "@/components/admin/settings/SettingsTabs";

export const dynamic = "force-dynamic";

// Settings. Owner-only, server-gated so typing the URL as another role shows
// the clean message. Square is Lumenati's own history (the shop ran on Square
// before this app); no other shop sees that tab.
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role, shop_id").eq("email", user.email!).maybeSingle()
    : { data: null };
  if (profile?.role !== "owner") {
    return <p className="text-sm text-white/65">Admins only.</p>;
  }

  let square: SquareProps | null = null;
  if (isSquareConfigured && profile.shop_id === LUMENATI_SHOP_ID) {
    // Tolerate the schema not being applied yet (errors -> empty defaults).
    let members: SquareProps["members"] = [];
    let sync: { last_synced_at: string | null; last_result: string | null } | null = null;
    let salesCount = 0;
    try {
      const r = await supabase.from("square_team_members").select("square_id, name, artist_id").order("name");
      members = r.data ?? [];
    } catch {
      /* schema not applied yet */
    }
    try {
      const r = await supabase.from("square_sync").select("last_synced_at, last_result").eq("id", 1).maybeSingle();
      sync = r.data;
    } catch {
      /* ignore */
    }
    try {
      const r = await supabase.from("sales").select("id", { count: "exact", head: true });
      salesCount = r.count ?? 0;
    } catch {
      /* ignore */
    }
    square = {
      configured: isSquareConfigured,
      members,
      lastSyncedAt: sync?.last_synced_at ?? null,
      lastResult: sync?.last_result ?? null,
      salesCount,
      artists: (await fetchArtists()).map((a) => ({ id: a.id, name: a.name })),
    };
  }
  return <SettingsTabs square={square} />;
}
