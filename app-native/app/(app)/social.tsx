import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { Badge, Button, Card, Empty, SectionTitle } from "@/components/ui";

// Social queue (parity with /admin/social): clients' healed-photo uploads,
// approve for the portfolio/socials or dismiss — built for doing it from the
// couch, which is where this call actually gets made.

type Photo = {
  id: string;
  url: string;
  status: string;
  created_at: string;
  clients: { first_name: string; last_name: string } | null;
  artists: { name: string } | null;
};

export default function Social() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Photo[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("healed_photos")
      .select("id, url, status, created_at, clients(first_name, last_name), artists(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(40);
    setRows((data ?? []) as unknown as Photo[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const judge = async (id: string, status: "approved" | "dismissed") => {
    await supabase.from("healed_photos").update({ status }).eq("id", id);
    setRows((r) => (r ?? []).filter((p) => p.id !== id));
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Social", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {rows === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            <SectionTitle right={<Badge label={`${rows.length} waiting`} tone={rows.length ? "brand" : "good"} />}>
              Healed photo approvals
            </SectionTitle>
            {rows.length === 0 ? (
              <Card>
                <Empty>No healed photos waiting. The queue refills as clients upload.</Empty>
              </Card>
            ) : (
              rows.map((p) => (
                <Card key={p.id} style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
                  <Image source={{ uri: p.url }} style={{ width: "100%", aspectRatio: 1 }} resizeMode="cover" />
                  <View style={{ padding: 14 }}>
                    <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "600" }}>
                      {p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "Client"}
                      {p.artists?.name ? `  ·  ${p.artists.name}` : ""}
                    </Text>
                    <Text style={{ color: theme.textFaint, fontSize: 12.5, marginTop: 3 }}>
                      uploaded {new Date(p.created_at).toLocaleDateString()}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                      <View style={{ flex: 1 }}>
                        <Button label="Approve" onPress={() => judge(p.id, "approved")} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button label="Dismiss" tone="ghost" onPress={() => judge(p.id, "dismissed")} />
                      </View>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
