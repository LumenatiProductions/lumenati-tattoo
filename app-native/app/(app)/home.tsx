import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";
import { Stat } from "@/components/ui";
import ArtistMoney from "@/components/ArtistMoney";

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Role-routed home: artists get the money + coaching dashboard (6b), staff get
// the shop glance (the owner cockpit port lands in 6d).
export default function Home() {
  const { role, email, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const isStaff = role === "owner" || role === "bookkeeper" || role === "frontdesk";
  const firstName = (email ?? "").split("@")[0];
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>
            LUMENATI<Text style={{ color: theme.brand }}>.</Text>
          </Text>
          <Text style={styles.role}>{role ?? ""}</Text>
        </View>
        <Pressable onPress={signOut}>
          <Text style={styles.signout}>Sign out</Text>
        </Pressable>
      </View>

      {isStaff ? <StaffHome firstName={firstName} /> : <ArtistMoney firstName={firstName} />}
    </ScrollView>
  );
}

function StaffHome({ firstName }: { firstName: string }) {
  const [stats, setStats] = useState<{ gross: number; apptsToday: number; lowStock: number; tickets: number } | null>(null);

  useEffect(() => {
    (async () => {
      const date = todayLocal();
      const [salesRes, apptRes, invRes] = await Promise.all([
        supabase.from("sales").select("service_cents, tip_cents"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .gte("starts_at", date)
          .lte("starts_at", `${date}T23:59:59.999`)
          .neq("status", "cancelled"),
        supabase.from("inventory_items").select("qty, reorder_at"),
      ]);
      const sales = (salesRes.data ?? []) as { service_cents: number; tip_cents: number }[];
      const inv = (invRes.data ?? []) as { qty: number; reorder_at: number }[];
      setStats({
        gross: sales.reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0),
        apptsToday: (apptRes as { count?: number }).count ?? 0,
        lowStock: inv.filter((i) => Number(i.qty) <= Number(i.reorder_at)).length,
        tickets: sales.length,
      });
    })();
  }, []);

  return (
    <View>
      <Text style={styles.greeting}>Hey {firstName}</Text>
      {!stats ? (
        <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.grid}>
          <Stat label="Gross sales" value={money(stats.gross)} accent />
          <Stat label="Appointments today" value={String(stats.apptsToday)} />
          <Stat label="Low stock" value={String(stats.lowStock)} warn={stats.lowStock > 0} />
          <Stat label="Tickets" value={String(stats.tickets)} />
        </View>
      )}
      <Text style={styles.note}>The full owner cockpit lands on the app in 6d. For now, the web admin has the deep view.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { color: theme.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  role: { color: theme.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, marginTop: 2 },
  signout: { color: theme.textDim, fontSize: 13 },
  greeting: { color: theme.text, fontSize: 28, fontWeight: "700", marginTop: 24, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  note: { color: theme.textFaint, fontSize: 13, marginTop: 28, lineHeight: 19 },
});
