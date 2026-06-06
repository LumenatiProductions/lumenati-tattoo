import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, money } from "@/lib/theme";
import { Card, Stat } from "@/components/ui";
import { apiGet } from "@/lib/appApi";

type Artist = {
  id: string;
  name: string;
  payType: string;
  splitPct: number;
  saleCount: number;
  grossService: number;
  grossTips: number;
  shopCut: number;
  artistEarnings: number;
};
type Reports = {
  range: { from: string; to: string };
  real: boolean;
  shop: {
    grossSales: number;
    splitRevenue: number;
    rentCollected: number;
    payoutsOwed: number;
    cardTotal: number;
    cashTotal: number;
  };
  artists: Artist[];
};

const payLabel = (a: Artist) =>
  a.payType === "rent" ? "Booth rent" : a.payType === "split" ? `${Math.round(a.splitPct * 100)}% split` : `Hybrid ${Math.round(a.splitPct * 100)}%`;

// Reports in the app (POS 6e). Reuses the SAME server math as the web via
// /api/reports (now Bearer-aware) — no money math duplicated in the app.
export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiGet<Reports>("/api/reports");
    if (r.ok && r.data) {
      setData(r.data);
      setError(null);
    } else {
      setError(r.error ?? "Could not load reports.");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Reports", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        {loading ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : error ? (
          <Card>
            <Text style={styles.err}>{error}</Text>
          </Card>
        ) : data ? (
          <>
            <Text style={styles.range}>
              {data.range.from} → {data.range.to}
              {!data.real && " · no tickets yet"}
            </Text>
            <View style={styles.grid}>
              <Stat label="Gross sales" value={money(data.shop.grossSales)} accent />
              <Stat label="Shop's cut" value={money(data.shop.splitRevenue)} />
              <Stat label="Rent collected" value={money(data.shop.rentCollected)} />
              <Stat label="To pay artists" value={money(data.shop.payoutsOwed)} warn={data.shop.payoutsOwed > 0} />
            </View>

            <Text style={styles.section}>Per-artist</Text>
            <Card style={{ padding: 0 }}>
              {data.artists.length === 0 ? (
                <Text style={styles.empty}>No tickets in this range.</Text>
              ) : (
                data.artists.map((a, i) => (
                  <View key={a.id} style={[styles.row, i > 0 && styles.border]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{a.name}</Text>
                      <Text style={styles.sub}>
                        {payLabel(a)} · {a.saleCount} ticket{a.saleCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.net}>{money(a.artistEarnings)}</Text>
                      <Text style={styles.sub}>shop {money(a.shopCut)}</Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
            <Text style={styles.note}>Full breakdown, 1099 prep, and CSV export live on the web admin.</Text>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  range: { color: theme.textFaint, fontSize: 12, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  section: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "600", marginTop: 22, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", padding: 14, gap: 10 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  name: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sub: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  net: { color: theme.text, fontSize: 15, fontWeight: "700" },
  err: { color: "#fb7185", fontSize: 14, padding: 4 },
  empty: { color: theme.textFaint, fontSize: 14, padding: 16 },
  note: { color: theme.textFaint, fontSize: 13, marginTop: 18, lineHeight: 18 },
});
