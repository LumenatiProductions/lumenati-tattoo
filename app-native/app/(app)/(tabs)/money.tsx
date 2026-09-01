import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import ArtistMoney from "@/components/ArtistMoney";
import ShopHome from "@/components/ShopHome";
import Launcher from "@/components/Launcher";
import PreviewBanner from "@/components/PreviewBanner";
import { SectionTitle } from "@/components/ui";

// Money. The whole money story on one tab with one range toggle: earnings,
// the goal race, rewards, rent, taxes for an artist; the shop grid, the shop
// goal, every chair and the coach for an owner. The finance screens that used
// to sit in the launcher grid are the list at the bottom.
const OWNER_LINKS = ["/payouts", "/reports", "/rent", "/cash", "/reconcile"];
const ARTIST_LINKS = ["/payouts", "/goals", "/expenses"];

export default function Money() {
  const { role, email, fullName, shopId } = useAuth();
  const insets = useSafeAreaInsets();
  const isStaff = role === "owner";
  const firstName = (fullName ?? "").trim().split(/\s+/)[0] || (email ?? "").split("@")[0];
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { preview } = usePreview();
  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<"shop" | "mine">("shop");

  useEffect(() => {
    if (isStaff && email) {
      supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle()
        .then(({ data }) => setMyArtistId((data?.artist_id as string | null) ?? null));
    }
  }, [isStaff, email, shopId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const artistView = !!preview || !isStaff || (!!myArtistId && homeTab === "mine");

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
    <InkWash />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
    >
      <Text style={styles.title}>Money</Text>
      <PreviewBanner />

      {!preview && isStaff && myArtistId && (
        <View style={styles.homeTabs}>
          {(["shop", "mine"] as const).map((t) => (
            <Pressable key={t} onPress={() => setHomeTab(t)} style={[styles.homeTab, homeTab === t && styles.homeTabOn]}>
              <Text style={[styles.homeTabText, homeTab === t && styles.homeTabTextOn]}>
                {t === "shop" ? "Shop" : "My chair"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ height: 16 }} />

      {preview ? (
        <ArtistMoney firstName={firstName} artistId={preview.artistId} previewName={preview.name} reloadKey={reloadKey} section="money" />
      ) : isStaff && !(myArtistId && homeTab === "mine") ? (
        <ShopHome firstName={firstName} role={role} reloadKey={reloadKey} section="money" />
      ) : (
        <ArtistMoney firstName={firstName} artistId={myArtistId ?? undefined} reloadKey={reloadKey} section="money" />
      )}

      <SectionTitle>{artistView ? "Your money tools" : "Shop finances"}</SectionTitle>
      <Launcher role={artistView ? "artist" : "owner"} only={artistView ? ARTIST_LINKS : OWNER_LINKS} flat />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
  homeTabs: { flexDirection: "row", gap: 8, marginTop: 16 },
  homeTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderColor: theme.border, borderWidth: 1 },
  homeTabOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  homeTabText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  homeTabTextOn: { color: "#fff" },
});
