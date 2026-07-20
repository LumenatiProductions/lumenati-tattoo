import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/appApi";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { Badge, Button, Card, Empty, SectionTitle, Stat } from "@/components/ui";
import { Chips } from "@/components/form";

// Integrations (parity with /admin/integrations, owner only): Square sync
// status, "Sync now", and mapping Square team members to artists. Connecting
// Square itself (the access token) stays on the web — it's a Vercel env var.

type Member = { square_id: string; name: string; artist_id: string | null };
type Artist = { id: string; name: string };

export default function Integrations() {
  const insets = useSafeAreaInsets();
  const { role, shopId } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [salesCount, setSalesCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    const [{ data: m }, { data: a }, { data: s }, { count }] = await Promise.all([
      supabase.from("square_team_members").select("square_id, name, artist_id").order("name"),
      supabase.from("artists").select("id, name").eq("shop_id", shopId!).eq("active", true).order("sort"),
      supabase.from("square_sync").select("last_synced_at, last_result").eq("id", 1).maybeSingle(),
      supabase.from("sales").select("id", { count: "exact", head: true }),
    ]);
    setMembers((m ?? []) as Member[]);
    setArtists((a ?? []) as Artist[]);
    setLastSyncedAt((s?.last_synced_at as string | null) ?? null);
    setLastResult((s?.last_result as string | null) ?? null);
    setSalesCount(count ?? 0);
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (role !== "owner") {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Integrations", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
        <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20 }}>
          <InkWash />
          <Card>
            <Empty>Admins only.</Empty>
          </Card>
        </View>
      </>
    );
  }

  const sync = async () => {
    setSyncing(true);
    setMsg(null);
    const res = await apiPost<{ ok: boolean; result?: string; error?: string }>("/api/square/sync");
    setSyncing(false);
    setMsg(res.ok ? res.data?.result ?? "Synced." : res.error ?? "Sync failed.");
    if (res.ok) load();
  };

  const setArtist = async (squareId: string, artistId: string) => {
    setMembers((m) => (m ?? []).map((x) => (x.square_id === squareId ? { ...x, artist_id: artistId === "none" ? null : artistId } : x)));
    await supabase
      .from("square_team_members")
      .update({ artist_id: artistId === "none" ? null : artistId })
      .eq("square_id", squareId);
  };

  const mapped = (members ?? []).filter((m) => m.artist_id).length;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Integrations", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {members === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Stat label="Sales synced" value={String(salesCount)} />
              <Stat
                label="Last sync"
                value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "never"}
                sub={lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : undefined}
              />
            </View>

            <View style={{ marginTop: 14 }}>
              <Button label={syncing ? "Syncing…" : "Sync Square now"} onPress={sync} disabled={syncing} />
            </View>
            {(msg ?? lastResult) ? (
              <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 10 }}>{msg ?? lastResult}</Text>
            ) : null}

            <SectionTitle>Square team → artists</SectionTitle>
            {members.length === 0 ? (
              <Card>
                <Empty>No team members yet — Sync now pulls them from Square. If Square isn't connected, set that up on the web admin.</Empty>
              </Card>
            ) : (
              <Card>
                <Text style={{ color: theme.textFaint, fontSize: 12.5, marginBottom: 12 }}>
                  {mapped}/{members.length} mapped. After changing mappings, sync again to apply them to past sales.
                </Text>
                {members.map((m) => (
                  <View key={m.square_id} style={{ marginBottom: 4 }}>
                    <Chips
                      label={m.name}
                      value={m.artist_id ?? "none"}
                      options={["none", ...artists.map((a) => a.id)]}
                      display={(id) => (id === "none" ? "Not an artist" : artists.find((a) => a.id === id)?.name ?? id)}
                      onChange={(v) => setArtist(m.square_id, v)}
                    />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
