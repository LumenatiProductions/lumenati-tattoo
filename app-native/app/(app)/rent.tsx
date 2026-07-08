import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";
import { Badge, Card, Empty, ListRow, SectionTitle, Stat } from "@/components/ui";

// Booth rent (parity with /admin/rent): who's paid this month, who hasn't.
// Invoices + pay links are minted by the monthly job; marking paid-in-cash
// from the phone covers the artist who hands you bills at the counter.

type Invoice = {
  id: string;
  period: string;
  amount_cents: number;
  due_date: string | null;
  status: string;
  artists: { name: string } | null;
};

export default function Rent() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("rent_invoices")
      .select("id, period, amount_cents, due_date, status, artists(name)")
      .order("period", { ascending: false })
      .limit(60);
    setRows((data ?? []) as unknown as Invoice[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const markPaid = async (id: string) => {
    await supabase.from("rent_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  const period = new Date().toISOString().slice(0, 7);
  const current = (rows ?? []).filter((r) => r.period === period);
  const past = (rows ?? []).filter((r) => r.period !== period);
  // Outstanding = every unpaid invoice, ANY month — old rent doesn't stop
  // being owed when the calendar turns (same rule as the web rent page).
  const pending = (rows ?? []).filter((r) => r.status === "pending");
  const owed = pending.reduce((a, r) => a + r.amount_cents, 0);
  const pastDue = pending.filter((r) => r.period !== period);

  const renderRow = (r: Invoice, i: number) => (
    <ListRow
      key={r.id}
      first={i === 0}
      title={`${r.artists?.name ?? r.id}  ·  ${money(r.amount_cents)}`}
      sub={`${r.period}${r.due_date ? ` · due ${r.due_date}` : ""}${r.status === "pending" && r.period < period ? " · PAST MONTH" : ""}`}
      right={
        r.status === "pending" ? (
          <Text onPress={() => markPaid(r.id)} style={{ color: theme.brand, fontSize: 13.5, fontWeight: "700" }}>
            Mark paid
          </Text>
        ) : (
          <Badge label={r.status} tone={r.status === "paid" ? "good" : "neutral"} />
        )
      }
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Booth rent", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {rows === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Stat
              label="Outstanding"
              value={money(owed)}
              hero
              sub={`${pending.length} unpaid${pastDue.length ? ` · ${pastDue.length} from past months` : ""}`}
            />

            <SectionTitle>This month</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {current.length === 0 ? <Empty>No invoices for this period yet — they mint on the 1st.</Empty> : current.map(renderRow)}
            </Card>

            <SectionTitle>Past months</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {past.length === 0 ? <Empty>No history yet.</Empty> : past.slice(0, 20).map(renderRow)}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}
