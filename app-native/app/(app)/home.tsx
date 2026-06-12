import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";
import { Stat } from "@/components/ui";
import ArtistMoney from "@/components/ArtistMoney";
import Launcher from "@/components/Launcher";
import { LumenatiLogo } from "@/components/LumenatiLogo";

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Co-owner",
  bookkeeper: "Bookkeeper",
  artist: "Artist",
  frontdesk: "Front desk",
};

// Role-routed home: artists get the money + coaching dashboard (6b), staff get
// the shop glance (the owner cockpit port lands in 6d).
export default function Home() {
  const { role, email, fullName, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const isStaff = role === "owner" || role === "bookkeeper" || role === "frontdesk";
  // Greet like a person: profile name first, email prefix as the fallback.
  const firstName = (fullName ?? "").trim().split(/\s+/)[0] || (email ?? "").split("@")[0];
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Owner-only: see the app the way an artist does — global, every screen
  // scopes to the previewed artist until Exit.
  const { preview, setPreview } = usePreview();
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  // Staff who ALSO hold a chair (JD: co-owner + artist) get two homes in tabs.
  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<"shop" | "money">("shop");

  useEffect(() => {
    if (role === "owner") {
      supabase.from("artists").select("id, name").eq("active", true).order("sort")
        .then(({ data }) => setRoster((data ?? []) as { id: string; name: string }[]));
    }
    if (isStaff && email) {
      supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle()
        .then(({ data }) => setMyArtistId((data?.artist_id as string | null) ?? null));
    }
  }, [role, isStaff, email]);

  const previewArtist = preview;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
    >
      <View style={styles.header}>
        <LumenatiLogo width={72} />
        <Pressable onPress={signOut} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Ionicons name="log-out-outline" size={20} color={theme.textDim} />
        </Pressable>
      </View>

      {/* Who the app thinks you are — quiet eyebrow, not a pill in the header */}
      <Text style={styles.roleEyebrow}>
        {previewArtist ? "Artist · preview" : role ? ROLE_LABEL[role] ?? role : ""}
      </Text>

      {previewArtist ? (
        <>
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerText}>Viewing as {previewArtist.name}</Text>
            <Pressable onPress={() => setPreview(null)} hitSlop={8}>
              <Text style={styles.previewExit}>Exit</Text>
            </Pressable>
          </View>
          <ArtistMoney firstName={firstName} artistId={previewArtist.artistId} previewName={previewArtist.name} />
          <Launcher role="artist" />
        </>
      ) : isStaff ? (
        <>
          {myArtistId && (
            <View style={styles.homeTabs}>
              {(["shop", "money"] as const).map((t) => (
                <Pressable key={t} onPress={() => setHomeTab(t)} style={[styles.homeTab, homeTab === t && styles.homeTabOn]}>
                  <Text style={[styles.homeTabText, homeTab === t && styles.homeTabTextOn]}>
                    {t === "shop" ? "Shop" : "My money"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {myArtistId && homeTab === "money" ? (
            <ArtistMoney firstName={firstName} artistId={myArtistId} />
          ) : (
            <StaffHome firstName={firstName} reloadKey={reloadKey} />
          )}
        </>
      ) : (
        <ArtistMoney firstName={firstName} />
      )}

      {!previewArtist && <Launcher role={role} />}

      {role === "owner" && !previewArtist && roster.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <Text style={styles.sectionLabel}>View as artist</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {roster.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setPreview({ artistId: a.id, name: a.name })}
                style={({ pressed }) => [styles.previewChip, pressed && { borderColor: theme.brandBorder }]}
              >
                <Text style={styles.previewChipText}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

type StaffStats = {
  gross: number;
  apptsToday: number;
  tickets: number;
  lowNames: string[];
  followupsDue: number;
  depositsHeld: number;
  expiring: number;
};

function StaffHome({ firstName, reloadKey }: { firstName: string; reloadKey: number }) {
  const [stats, setStats] = useState<StaffStats | null>(null);

  useEffect(() => {
    (async () => {
      const date = todayLocal();
      const nowIso = new Date().toISOString();
      const [salesRes, apptRes, invRes, fuRes, heldRes, compRes] = await Promise.all([
        supabase.from("sales").select("service_cents, tip_cents"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .gte("starts_at", date)
          .lte("starts_at", `${date}T23:59:59.999`)
          .neq("status", "cancelled"),
        supabase.from("inventory_items").select("name, qty, reorder_at"),
        supabase.from("followups").select("id", { count: "exact", head: true }).eq("status", "pending").lte("scheduled_for", nowIso),
        supabase.from("bookings").select("deposit_cents").eq("deposit_status", "held"),
        supabase.from("compliance_items").select("id", { count: "exact", head: true }).in("status", ["expiring", "expired"]),
      ]);
      const sales = (salesRes.data ?? []) as { service_cents: number; tip_cents: number }[];
      const inv = (invRes.data ?? []) as { name: string; qty: number; reorder_at: number }[];
      const held = (heldRes.data ?? []) as { deposit_cents: number }[];
      setStats({
        gross: sales.reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
        apptsToday: (apptRes as { count?: number }).count ?? 0,
        tickets: sales.length,
        lowNames: inv.filter((i) => Number(i.qty) <= Number(i.reorder_at)).map((i) => i.name),
        followupsDue: (fuRes as { count?: number }).count ?? 0,
        depositsHeld: held.reduce((a, h) => a + (h.deposit_cents ?? 0), 0),
        expiring: (compRes as { count?: number }).count ?? 0,
      });
    })();
  }, [reloadKey]);

  if (!stats) {
    return (
      <View>
        <Text style={styles.greeting}>Hey {firstName}</Text>
        <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const attention: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [];
  if (stats.expiring)
    attention.push({ icon: "shield-outline", text: `${stats.expiring} license/permit expiring or expired` });
  if (stats.lowNames.length)
    attention.push({
      icon: "cube-outline",
      text: `Reorder: ${stats.lowNames.slice(0, 4).join(", ")}${stats.lowNames.length > 4 ? "…" : ""}`,
    });
  if (stats.followupsDue)
    attention.push({ icon: "chatbubble-ellipses-outline", text: `${stats.followupsDue} follow-up${stats.followupsDue === 1 ? "" : "s"} due` });

  return (
    <View>
      <Text style={styles.greeting}>Hey {firstName}</Text>
      <Text style={styles.greetSub}>Here&apos;s the shop right now.</Text>
      <View style={styles.grid}>
        <Stat label="Gross sales" value={money(stats.gross)} sub={`${stats.tickets} tickets`} hero />
        <Stat label="Appointments today" value={String(stats.apptsToday)} />
        <Stat label="Deposits held" value={money(stats.depositsHeld)} />
        <Stat label="Low stock" value={String(stats.lowNames.length)} warn={stats.lowNames.length > 0} />
        <Stat label="Follow-ups due" value={String(stats.followupsDue)} warn={stats.followupsDue > 0} />
      </View>

      <Text style={styles.sectionLabel}>Needs attention</Text>
      {attention.length === 0 ? (
        <View style={styles.allClear}>
          <Ionicons name="checkmark-circle-outline" size={18} color={theme.good} />
          <Text style={styles.allClearText}>All clear — nothing needs a decision.</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {attention.map((a, i) => (
            <View key={i} style={styles.attnCard}>
              <View style={styles.attnRail} />
              <Ionicons name={a.icon} size={17} color={theme.warn} style={{ marginRight: 10 }} />
              <Text style={styles.attnText}>{a.text}</Text>
            </View>
          ))}
        </View>
      )}
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
  greeting: { color: theme.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, marginTop: 8 },
  greetSub: { color: theme.textFaint, fontSize: 14, marginTop: 4, marginBottom: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "700",
    marginTop: 26,
    marginBottom: 10,
  },
  allClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.goodSoft,
    borderColor: "rgba(52,211,153,0.3)",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  allClearText: { color: theme.good, fontSize: 14.5, fontWeight: "600", flex: 1 },
  attnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  attnRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: theme.warn },
  attnText: { color: theme.text, fontSize: 14.5, lineHeight: 20, flex: 1 },
  previewBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.brandSoft,
    borderColor: theme.brandBorder,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  previewBannerText: { color: theme.brand, fontSize: 13.5, fontWeight: "700" },
  previewExit: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
  previewChip: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  previewChipText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  homeTabs: { flexDirection: "row", gap: 8, marginTop: 18 },
  homeTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderColor: theme.border, borderWidth: 1 },
  homeTabOn: { backgroundColor: theme.brand, borderColor: theme.brand },
  homeTabText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  homeTabTextOn: { color: "#fff" },
});
