import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Card } from "@/components/ui";

type Item = {
  id: string;
  scope: string;
  artist_id: string | null;
  kind: string;
  label: string | null;
  expires_on: string | null;
  status: string;
};

const KIND: Record<string, string> = {
  tattoo_license: "Tattoo license",
  bbp_cert: "BBP certification",
  shop_permit: "Shop permit",
  inspection: "Inspection",
  insurance: "Liability insurance",
};
const TONE: Record<string, string> = { active: theme.good, expiring: theme.warn, expired: "#fb7185", na: theme.textFaint };

function daysNote(expires: string | null, status: string): string {
  if (!expires) return "no expiry";
  const a = Date.now();
  const b = new Date(`${expires.slice(0, 10)}T00:00:00Z`).getTime();
  const d = Math.round((b - a) / 86_400_000);
  if (status === "expired" || d < 0) return `expired ${Math.abs(d)}d ago`;
  return `${d}d left`;
}

// Compliance in the app (POS 6e). Read-only license/permit list, RLS owner-only.
// Expiring/expired float to the top so the owner can renew before a lapse.
export default function Compliance() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("compliance_items")
        .select("id, scope, artist_id, kind, label, expires_on, status")
        .order("expires_on", { ascending: true, nullsFirst: false });
      const rows = (data ?? []) as Item[];
      setItems(rows);
      const ids = [...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[])];
      if (ids.length) {
        const { data: a } = await supabase.from("artists").select("id, name").in("id", ids);
        setNames(new Map(((a ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
      }
      setLoading(false);
    })();
  }, []);

  const rank = (s: string) => (s === "expired" ? 0 : s === "expiring" ? 1 : 2);
  const sorted = [...items].sort((a, b) => rank(a.status) - rank(b.status));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Compliance", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        {loading ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : (
          <Card style={{ padding: 0 }}>
            {sorted.length === 0 ? (
              <Text style={styles.empty}>Nothing tracked. Add licenses & permits on the web admin.</Text>
            ) : (
              sorted.map((it, i) => (
                <View key={it.id} style={[styles.row, i > 0 && styles.border]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{it.label?.trim() || KIND[it.kind] || it.kind}</Text>
                    <Text style={styles.sub}>
                      {it.scope === "artist" && it.artist_id ? `${names.get(it.artist_id) ?? "Artist"} · ` : "Shop · "}
                      {daysNote(it.expires_on, it.status)}
                    </Text>
                  </View>
                  <Text style={[styles.status, { color: TONE[it.status] ?? theme.textDim }]}>{it.status}</Text>
                </View>
              ))
            )}
          </Card>
        )}
        <Text style={styles.note}>Add, edit, and attach scans on the web admin.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  name: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  status: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
  note: { color: theme.textFaint, fontSize: 13, marginTop: 16 },
});
