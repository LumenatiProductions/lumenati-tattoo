import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { tap } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";
import { Stat } from "@/components/ui";
import InkWash from "@/components/InkWash";
import ArtistMoney from "@/components/ArtistMoney";
import Launcher from "@/components/Launcher";
import { LumenatiLogo } from "@/components/LumenatiLogo";

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Local YYYY-MM-DD for N days ago — same anchoring as the web's daysAgoLocal so
// the week window matches the Monday email.
const daysAgoLocal = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Two roles now: Admin runs the shop, Artist runs their chair (legacy
// bookkeeper/frontdesk values read as Admin).
const ROLE_LABEL: Record<string, string> = {
  owner: "Admin",
  bookkeeper: "Admin",
  artist: "Artist",
  frontdesk: "Admin",
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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
    {/* Fixed ink atmosphere; the glass panels scroll over it. */}
    <InkWash />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
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
          <ArtistMoney firstName={firstName} artistId={previewArtist.artistId} previewName={previewArtist.name} reloadKey={reloadKey} />
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
            <ArtistMoney firstName={firstName} artistId={myArtistId} reloadKey={reloadKey} />
          ) : (
            <StaffHome firstName={firstName} role={role} reloadKey={reloadKey} />
          )}
        </>
      ) : (
        <ArtistMoney firstName={firstName} reloadKey={reloadKey} />
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
                style={({ pressed }) => [styles.previewChip, pressed && { borderColor: theme.borderStrong }]}
              >
                <Text style={styles.previewChipText}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
    </View>
  );
}

type StaffStats = {
  gross: number;
  service: number;
  tips: number;
  card: number;
  cash: number;
  apptsToday: number;
  checkedIn: number;
  tickets: number;
  lowNames: string[];
  outNames: string[];
  followupsDue: number;
  depositsHeld: number;
  expired: number;
  expiringSoon: number;
};

type Sev = "high" | "med" | "low";
const SEV_COLOR: Record<Sev, string> = { high: theme.bad, med: theme.warn, low: theme.textFaint };
type AttnItem = { icon: keyof typeof Ionicons.glyphMap; text: string; detail?: string; sev: Sev; href: string };

function StaffHome({ firstName, role, reloadKey }: { firstName: string; role: string | null; reloadKey: number }) {
  const router = useRouter();
  const [stats, setStats] = useState<StaffStats | null>(null);
  // Same role gating as the Launcher — a glance row never opens a screen the
  // role can't use. Bookkeepers also skip ops noise (stock/follow-ups), like
  // the web bookkeeper home.
  const ops = role === "owner" || role === "frontdesk";

  useEffect(() => {
    (async () => {
      const date = todayLocal();
      const nowIso = new Date().toISOString();
      const [salesRes, apptRes, invRes, fuRes, heldRes, compRes] = await Promise.all([
        // Last 7 days, same window as the web home + the Monday email — the
        // all-time number used to masquerade as "right now" here.
        supabase.from("sales").select("service_cents, tip_cents, method").gte("created_at", daysAgoLocal(7)),
        supabase
          .from("bookings")
          .select("checked_in_at")
          .gte("starts_at", date)
          .lte("starts_at", `${date}T23:59:59.999`)
          .neq("status", "cancelled"),
        supabase.from("inventory_items").select("name, qty, reorder_at"),
        supabase.from("followups").select("id", { count: "exact", head: true }).eq("status", "pending").lte("scheduled_for", nowIso),
        supabase.from("bookings").select("deposit_cents").eq("deposit_status", "held"),
        supabase.from("compliance_items").select("status").in("status", ["expiring", "expired"]),
      ]);
      const sales = (salesRes.data ?? []) as { service_cents: number; tip_cents: number; method: string }[];
      const appts = (apptRes.data ?? []) as { checked_in_at: string | null }[];
      const inv = (invRes.data ?? []) as { name: string; qty: number; reorder_at: number }[];
      const held = (heldRes.data ?? []) as { deposit_cents: number }[];
      const comp = (compRes.data ?? []) as { status: string }[];
      const low = inv.filter((i) => Number(i.qty) <= Number(i.reorder_at));
      setStats({
        gross: sales.reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
        service: sales.reduce((a, s) => a + (s.service_cents ?? 0), 0),
        tips: sales.reduce((a, s) => a + (s.tip_cents ?? 0), 0),
        card: sales.filter((s) => s.method !== "cash").reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
        cash: sales.filter((s) => s.method === "cash").reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
        apptsToday: appts.length,
        checkedIn: appts.filter((b) => b.checked_in_at).length,
        tickets: sales.length,
        lowNames: low.filter((i) => Number(i.qty) > 0).map((i) => i.name),
        outNames: low.filter((i) => Number(i.qty) <= 0).map((i) => i.name),
        followupsDue: (fuRes as { count?: number }).count ?? 0,
        depositsHeld: held.reduce((a, h) => a + (h.deposit_cents ?? 0), 0),
        expired: comp.filter((c) => c.status === "expired").length,
        expiringSoon: comp.filter((c) => c.status === "expiring").length,
      });
    })();
  }, [reloadKey]);

  if (!stats) {
    return (
      <View>
        <Text style={styles.greeting}>Hey {firstName}</Text>
        <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
      </View>
    );
  }

  // Ranked like the web cockpit: most urgent first, each row opens where you act.
  const attention: AttnItem[] = [];
  if (role === "owner" && stats.expired)
    attention.push({ icon: "shield-outline", sev: "high", text: `${stats.expired} license/permit expired`, detail: "renew to stay inspection-ready", href: "/compliance" });
  if (ops && stats.outNames.length)
    attention.push({ icon: "cube-outline", sev: "high", text: `${stats.outNames.length} suppl${stats.outNames.length === 1 ? "y" : "ies"} out`, detail: stats.outNames.slice(0, 3).join(", "), href: "/inventory" });
  if (role === "owner" && stats.expiringSoon)
    attention.push({ icon: "shield-outline", sev: "med", text: `${stats.expiringSoon} expiring within 30 days`, href: "/compliance" });
  if (ops && stats.lowNames.length)
    attention.push({ icon: "cube-outline", sev: "med", text: `Reorder: ${stats.lowNames.slice(0, 4).join(", ")}${stats.lowNames.length > 4 ? "…" : ""}`, href: "/inventory" });
  if (ops && stats.followupsDue)
    attention.push({ icon: "chatbubble-ellipses-outline", sev: "med", text: `${stats.followupsDue} follow-up${stats.followupsDue === 1 ? "" : "s"} due`, href: "/followups" });
  if (stats.apptsToday)
    attention.push({ icon: "calendar-outline", sev: "low", text: `${stats.apptsToday} appointment${stats.apptsToday === 1 ? "" : "s"} today`, detail: `${stats.checkedIn} checked in`, href: "/bookings" });
  if (stats.depositsHeld)
    attention.push({ icon: "card-outline", sev: "low", text: `${money(stats.depositsHeld)} in deposits held`, href: "/bookings" });

  return (
    <View>
      <Text style={styles.greeting}>Hey {firstName}</Text>
      <Text style={styles.greetSub}>Here&apos;s the shop right now.</Text>
      <View style={styles.grid}>
        <Stat label="This week" value={money(stats.gross)} countTo={stats.gross} sub={`${stats.tickets} tickets · last 7 days`} hero />
        <Stat label="Service" value={money(stats.service)} />
        <Stat label="Tips" value={money(stats.tips)} />
        <Stat label="Card" value={money(stats.card)} />
        <Stat label="Cash" value={money(stats.cash)} />
        <Stat
          label="Today"
          value={`${stats.checkedIn}/${stats.apptsToday}`}
          sub="checked in"
          onPress={() => router.push("/bookings")}
        />
        <Stat label="Deposits held" value={money(stats.depositsHeld)} onPress={() => router.push("/bookings")} />
        {ops && (
          <>
            <Stat
              label="Low stock"
              value={String(stats.lowNames.length + stats.outNames.length)}
              warn={stats.lowNames.length + stats.outNames.length > 0}
              onPress={() => router.push("/inventory")}
            />
            <Stat
              label="Follow-ups due"
              value={String(stats.followupsDue)}
              warn={stats.followupsDue > 0}
              onPress={() => router.push("/followups")}
            />
          </>
        )}
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
            <Pressable
              key={i}
              onPress={() => {
                tap();
                router.push(a.href as never);
              }}
              style={({ pressed }) => [styles.attnCard, pressed && { backgroundColor: theme.surfaceRaised }]}
            >
              <View style={[styles.attnRail, { backgroundColor: SEV_COLOR[a.sev] }]} />
              <Ionicons name={a.icon} size={17} color={SEV_COLOR[a.sev]} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.attnText}>{a.text}</Text>
                {a.detail ? <Text style={styles.attnDetail}>{a.detail}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={15} color={theme.textFaint} />
            </Pressable>
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
  attnRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  attnText: { color: theme.text, fontSize: 14.5, lineHeight: 20 },
  attnDetail: { color: theme.textFaint, fontSize: 12.5, marginTop: 2 },
  previewBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.surfaceRaised,
    borderColor: theme.border,
    borderTopColor: theme.glassEdge,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  previewBannerText: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
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
  // Tab selection is a lift, not a pink fill — pink is money-only now.
  homeTabOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  homeTabText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  homeTabTextOn: { color: "#fff" },
});
