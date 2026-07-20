import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/appApi";
import { useAuth } from "@/lib/auth";
import { todayLocal } from "@/lib/dates";
import { theme, money } from "@/lib/theme";
import InkWash from "@/components/InkWash";
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
  const { role } = useAuth();
  const isAdmin = role === "owner";
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
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

  // Card rent from the phone (bug f7ca0567): fetch the invoice's hosted pay
  // link and open it in the browser — same checkout the emailed link uses.
  const payCard = async (id: string) => {
    const r = await apiPost<{ url: string }>("/api/rent/pay-link", { invoiceId: id });
    if (r.ok && r.data?.url) Linking.openURL(r.data.url);
    else setNote(r.error ?? "Could not fetch the pay link.");
  };

  // The renter's side of cash rent (two-tap): declaring "paying in cash" puts
  // the stack on the handoff board; the invoice flips to paid when the admin
  // taps Got it with the cash in hand.
  const payCash = async (id: string) => {
    const r = await apiPost("/api/cash/rent-cash", { invoiceId: id, date: todayLocal() });
    setNote(
      r.ok
        ? "On the board — hand the cash to an admin and it clears when they tap Got it."
        : r.error ?? "Could not start the cash handoff.",
    );
    load();
  };

  // Resend the renter their hosted pay link by email (API action "email").
  const resendLink = async (id: string) => {
    const r = await apiPost<{ sentTo?: string }>("/api/rent/invoices", { action: "email", id });
    setNote(r.ok ? `Pay link sent${r.data?.sentTo ? ` to ${r.data.sentTo}` : ""}.` : r.error ?? "Could not send the link.");
  };

  // Void a pending invoice (mistake / waived rent). Confirmed — it clears it off
  // the books. Paid invoices can't be voided.
  const voidInvoice = (id: string) => {
    Alert.alert("Void this invoice?", "It comes off the books and stops counting as owed. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Void it",
        style: "destructive",
        onPress: async () => {
          const r = await apiPost("/api/rent/invoices", { action: "void", id });
          setNote(r.ok ? "Invoice voided." : r.error ?? "Could not void it.");
          load();
        },
      },
    ]);
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
          isAdmin ? (
            <View style={{ alignItems: "flex-end", gap: 8 }}>
              <Text onPress={() => markPaid(r.id)} style={{ color: theme.brand, fontSize: 13.5, fontWeight: "700" }}>
                Mark paid
              </Text>
              <Text onPress={() => resendLink(r.id)} style={{ color: theme.textDim, fontSize: 13, fontWeight: "600" }}>
                Resend link
              </Text>
              <Text onPress={() => voidInvoice(r.id)} style={{ color: theme.textFaint, fontSize: 13, fontWeight: "600" }}>
                Void
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: "flex-end", gap: 8 }}>
              <Text onPress={() => payCard(r.id)} style={{ color: theme.brand, fontSize: 13.5, fontWeight: "700" }}>
                Pay by card
              </Text>
              <Text onPress={() => payCash(r.id)} style={{ color: theme.textDim, fontSize: 13, fontWeight: "600" }}>
                Paying cash
              </Text>
            </View>
          )
        ) : (
          <Badge label={r.status} tone={r.status === "paid" ? "good" : "neutral"} />
        )
      }
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Booth rent", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {rows === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            {note ? <Text style={{ color: theme.textDim, fontSize: 13, marginBottom: 10 }}>{note}</Text> : null}
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
