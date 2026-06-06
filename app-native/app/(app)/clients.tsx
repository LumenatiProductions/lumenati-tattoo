import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Card } from "@/components/ui";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
};

// Clients in the app (POS 6e). Read-only search, RLS-scoped (staff only; artists
// get an empty list). Tap phone/IG to act.
export default function Clients() {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, phone, email, instagram")
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(500);
      setClients((data ?? []) as Client[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients;
    return clients.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.phone ?? ""} ${c.email ?? ""} ${c.instagram ?? ""}`.toLowerCase().includes(t),
    );
  }, [clients, q]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Clients", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name, phone, IG…"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          style={styles.search}
        />
        {loading ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : (
          <Card style={{ padding: 0, marginTop: 14 }}>
            {filtered.length === 0 ? (
              <Text style={styles.empty}>{clients.length ? "No matches." : "No clients yet."}</Text>
            ) : (
              filtered.slice(0, 200).map((c, i) => (
                <View key={c.id} style={[styles.row, i > 0 && styles.border]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {c.first_name} {c.last_name}
                    </Text>
                    <Text style={styles.sub}>
                      {c.phone || c.email || (c.instagram ? `@${c.instagram}` : "no contact")}
                    </Text>
                  </View>
                  {c.phone && (
                    <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)} style={styles.call}>
                      <Text style={styles.callText}>Call</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  name: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  call: { borderColor: theme.border, borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 14 },
  callText: { color: theme.text, fontSize: 13, fontWeight: "600" },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
});
