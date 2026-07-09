import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dimensions } from "react-native";
import { theme, money } from "@/lib/theme";
import { Card, Empty, Stat } from "@/components/ui";
import { apiGet } from "@/lib/appApi";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import MoneyChart from "@/components/MoneyChart";
import { cumulativeSeries, type SaleRow } from "@/lib/personal";
import { todayLocal } from "@/lib/dates";

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
    renterPassThrough: number;
    gustoWages: number;
    cardTotal: number;
    cashTotal: number;
  };
  artists: Artist[];
};

const payLabel = (a: Artist) =>
  a.payType === "booth_rent"
    ? "Booth rent"
    : a.payType === "payroll_split"
      ? `${Math.round(a.splitPct * 100)}% split · Gusto`
      : "Owner salary · Gusto";

// Reports in the app (POS 6e). Reuses the SAME server math as the web via
// /api/reports (now Bearer-aware) — no money math duplicated in the app.
export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { role } = useAuth();
  const allowed = role === "owner" || role === "bookkeeper";
  const [data, setData] = useState<Reports | null>(null);
  const [monthSales, setMonthSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([
      // Anchor the default YTD window to the phone's local calendar — the
      // server would otherwise use UTC, which is tomorrow from 5-6pm Denver.
      apiGet<Reports>(`/api/reports?from=${todayLocal().slice(0, 4)}-01-01&to=${todayLocal()}`),
      // Month-to-date shop gross for the chart (owner/bookkeeper RLS sees all).
      supabase
        .from("sales")
        .select("created_at, service_cents, tip_cents")
        .gte("created_at", `${todayLocal().slice(0, 7)}-01`),
    ]);
    setMonthSales(((s.data ?? []) as SaleRow[]) || []);
    if (r.ok && r.data) {
      setData(r.data);
      setError(null);
    } else {
      setError(r.error ?? "Could not load reports.");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  // Same gate the server enforces (owner/bookkeeper) — without it an artist
  // deep-linking here fires a doomed request and sees a raw fetch error.
  if (!allowed) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Reports", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
        <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20 }}>
          <Card>
            <Empty>Owners & bookkeepers only.</Empty>
          </Card>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Reports", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        {loading ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
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
            {monthSales.length > 0 && (
              <Card style={{ marginBottom: 14 }}>
                <Text style={styles.chartLabel}>SHOP · MONTH TO DATE</Text>
                <MoneyChart
                  series={cumulativeSeries(monthSales, "month")}
                  startLabel="month"
                  endLabel="today"
                  width={Dimensions.get("window").width - 72}
                />
              </Card>
            )}
            <View style={styles.grid}>
              <Stat label="Gross sales" value={money(data.shop.grossSales)} countTo={data.shop.grossSales} accent />
              <Stat label="Shop's cut" value={money(data.shop.splitRevenue)} />
              <Stat label="Rent collected" value={money(data.shop.rentCollected)} />
              <Stat label="Renter pass-through" value={money(data.shop.renterPassThrough)} warn={data.shop.renterPassThrough > 0} />
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
                      <Text style={styles.net}>{a.payType === "payroll_salary" ? "—" : money(a.artistEarnings)}</Text>
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
  chartLabel: { color: theme.textDim, fontSize: 11, letterSpacing: 1.6, fontWeight: "700", marginBottom: 8 },
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
