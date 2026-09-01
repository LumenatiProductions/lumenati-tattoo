import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import ArtistMoney from "@/components/ArtistMoney";
import ArtistSetup from "@/components/ArtistSetup";
import ShopHome from "@/components/ShopHome";
import PreviewBanner from "@/components/PreviewBanner";
import { LumenatiLogo } from "@/components/LumenatiLogo";

// Two roles: Admin runs the shop, Artist runs their chair.
const ROLE_LABEL: Record<string, string> = {
  owner: "Admin",
  artist: "Artist",
};

// Today. The first tab: what's next, this week's number, one coach line. No
// launcher, no year-to-date next to this-week. Money, Clients and Me are tabs
// of their own (Scott, 2026-09-01).
export default function Home() {
  const { role, email, fullName, signOut, shopId } = useAuth();
  const insets = useSafeAreaInsets();
  const isStaff = role === "owner";
  // Greet like a person: profile name first, email prefix as the fallback.
  const firstName = (fullName ?? "").trim().split(/\s+/)[0] || (email ?? "").split("@")[0];
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Owner-only: see the app the way an artist does — global, every screen
  // scopes to the previewed artist until Exit (the Me tab has the controls).
  const { preview } = usePreview();
  // Staff who ALSO hold a chair (JD: co-owner + artist) get two todays in tabs.
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
    {/* Fixed ink atmosphere; the glass panels scroll over it. */}
    <InkWash />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
    >
      <View style={styles.header}>
        <LumenatiLogo width={72} />
        <Pressable onPress={signOut} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Ionicons name="log-out-outline" size={20} color={theme.textDim} />
        </Pressable>
      </View>

      {/* Who the app thinks you are — quiet eyebrow, not a pill in the header */}
      <Text style={styles.roleEyebrow}>
        {preview ? "Artist · preview" : role ? ROLE_LABEL[role] ?? role : ""}
      </Text>
      <PreviewBanner />

      {preview ? (
        <ArtistMoney firstName={firstName} artistId={preview.artistId} previewName={preview.name} reloadKey={reloadKey} section="today" />
      ) : isStaff ? (
        <>
          {myArtistId && (
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
          {myArtistId && homeTab === "mine" ? (
            <ArtistMoney firstName={firstName} artistId={myArtistId} reloadKey={reloadKey} section="today" />
          ) : (
            <ShopHome firstName={firstName} role={role} reloadKey={reloadKey} section="today" />
          )}
        </>
      ) : (
        <>
          <ArtistSetup reloadKey={reloadKey} />
          <ArtistMoney firstName={firstName} reloadKey={reloadKey} section="today" />
        </>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roleEyebrow: {
    color: theme.textFaint,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    fontWeight: "700",
    marginTop: 24,
  },
  homeTabs: { flexDirection: "row", gap: 8, marginTop: 18 },
  homeTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderColor: theme.border, borderWidth: 1 },
  // Tab selection is a lift, not a pink fill — pink is money-only now.
  homeTabOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  homeTabText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  homeTabTextOn: { color: "#fff" },
});
