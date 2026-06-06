import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";

type Stats = {
  service: number;
  tips: number;
  tickets: number;
  apptsToday: number;
  lowStock: number;
};

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// One real screen on all three targets, reading RLS-scoped data directly from
// Supabase (an artist's `sales` query returns only theirs — no artist_id needed).
// 6b+ deepen this into the money/coaching home and the owner cockpit.
export default function Home() {
  const { role, email, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const isStaff = role === "owner" || role === "bookkeeper" || role === "frontdesk";

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const date = todayLocal();
    const [salesRes, apptRes, invRes] = await Promise.all([
      supabase.from("sales").select("service_cents, tip_cents"),
      isStaff
        ? supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .gte("starts_at", date)
            .lte("starts_at", `${date}T23:59:59.999`)
            .neq("status", "cancelled")
        : Promise.resolve({ count: 0 }),
      isStaff ? supabase.from("inventory_items").select("qty, reorder_at") : Promise.resolve({ data: [] }),
    ]);

    const sales = (salesRes.data ?? []) as { service_cents: number; tip_cents: number }[];
    const inv = ((invRes as { data?: { qty: number; reorder_at: number }[] }).data ?? []);
    setStats({
      service: sales.reduce((a, s) => a + (s.service_cents ?? 0), 0),
      tips: sales.reduce((a, s) => a + (s.tip_cents ?? 0), 0),
      tickets: sales.length,
      apptsToday: (apptRes as { count?: number }).count ?? 0,
      lowStock: inv.filter((i) => Number(i.qty) <= Number(i.reorder_at)).length,
    });
    setLoading(false);
  }, [isStaff]);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = (email ?? "").split("@")[0];

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.brand} />}
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

      <Text style={styles.greeting}>Hey {firstName}</Text>

      {loading && !stats ? (
        <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
      ) : isStaff ? (
        <View style={styles.grid}>
          <Stat label="Gross sales" value={money((stats?.service ?? 0) + (stats?.tips ?? 0))} accent />
          <Stat label="Appointments today" value={String(stats?.apptsToday ?? 0)} />
          <Stat label="Low stock" value={String(stats?.lowStock ?? 0)} warn={(stats?.lowStock ?? 0) > 0} />
          <Stat label="Tickets" value={String(stats?.tickets ?? 0)} />
        </View>
      ) : (
        <View style={styles.grid}>
          <Stat label="You brought in" value={money(stats?.service ?? 0)} accent />
          <Stat label="Tips" value={money(stats?.tips ?? 0)} />
          <Stat label="Tickets" value={String(stats?.tickets ?? 0)} />
        </View>
      )}

      <Text style={styles.note}>
        Live from your shop. This is the 6a shell — money, goals, taxes, and taking payment land next.
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <View style={[styles.stat, accent && { borderColor: theme.brand }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warn && { color: theme.warn }]}>{value}</Text>
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
  stat: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexGrow: 1,
    flexBasis: "45%",
  },
  statLabel: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  statValue: { color: theme.text, fontSize: 26, fontWeight: "700", marginTop: 6 },
  note: { color: theme.textFaint, fontSize: 13, marginTop: 28, lineHeight: 19 },
});
