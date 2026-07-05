import { createClient } from "@/lib/supabase/server";
import { isSquareConfigured } from "@/lib/square/client";
import { fetchArtists } from "@/lib/admin/artists-data";
import IntegrationsClient from "@/components/admin/IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const supabase = await createClient();

  // Owner-only (matches the sidebar). Server-gated so typing the URL as another
  // role shows the clean message, not a half-broken setup screen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("email", user.email!).maybeSingle()
    : { data: null };
  if (profile?.role !== "owner") {
    return <p className="text-sm text-white/65">Owners only.</p>;
  }

  // Tolerate the schema not being applied yet (errors -> empty defaults).
  let members: { square_id: string; name: string; artist_id: string | null }[] = [];
  let sync: { last_synced_at: string | null; last_result: string | null } | null = null;
  let salesCount = 0;
  try {
    const r = await supabase
      .from("square_team_members")
      .select("square_id, name, artist_id")
      .order("name");
    members = r.data ?? [];
  } catch {
    /* schema not applied yet */
  }
  try {
    const r = await supabase
      .from("square_sync")
      .select("last_synced_at, last_result")
      .eq("id", 1)
      .maybeSingle();
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

  return (
    <IntegrationsClient
      configured={isSquareConfigured}
      members={members}
      lastSyncedAt={sync?.last_synced_at ?? null}
      lastResult={sync?.last_result ?? null}
      salesCount={salesCount}
      artists={(await fetchArtists()).map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
