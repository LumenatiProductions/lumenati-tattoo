import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, money } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/appApi";
import { chaChing, trouble } from "@/lib/haptics";

// Instant payout — "cash out now" to the artist's debit card. The artist pays
// Stripe's instant fee (~1.5%); standard payouts are free and arrive in ~2 days.
// Fully functional on every target (no native module needed).
export default function CashOut() {
  const insets = useSafeAreaInsets();
  const [instant, setInstant] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiGet<{ instantCents: number }>("/api/payouts/instant");
    if (r.ok) {
      setInstant(r.data?.instantCents ?? 0);
      setError(null);
    } else {
      setError(r.error ?? "Could not load balance.");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const cashOut = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    const r = await apiPost<{ amountCents: number }>("/api/payouts/instant");
    setBusy(false);
    if (r.ok) {
      chaChing(); // money moved — it should feel like it
      setMsg(`${money(r.data?.amountCents ?? 0)} on its way to your debit card.`);
      await load();
    } else {
      trouble();
      setError(r.error ?? "Could not cash out.");
    }
  };

  const fee = instant ? Math.round(instant * 0.015) : 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Cash out", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <Card>
          {loading ? (
            <ActivityIndicator color={theme.brand} />
          ) : (
            <>
              <Text style={styles.label}>Available now</Text>
              <Text style={styles.amount}>{money(instant ?? 0)}</Text>
              <Text style={styles.fee}>
                {instant && instant >= 50
                  ? `Instant to your debit card · ~${money(fee)} fee. Or wait ~2 days for free.`
                  : "Nothing to cash out yet — paid tickets land here."}
              </Text>
            </>
          )}
        </Card>

        {msg && <Text style={styles.ok}>{msg}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ height: 18 }} />
        <Button
          label={busy ? "Sending…" : `Cash out ${money(instant ?? 0)} now`}
          onPress={cashOut}
          disabled={busy || !instant || instant < 50}
        />
        <Text style={styles.note}>
          You set up payouts in the shop&apos;s Payouts screen. Needs an eligible debit card on your
          Stripe account for instant.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  amount: { color: theme.text, fontSize: 40, fontWeight: "800", marginTop: 6 },
  fee: { color: theme.textFaint, fontSize: 13, marginTop: 10, lineHeight: 18 },
  ok: { color: theme.good, marginTop: 16, fontSize: 15 },
  error: { color: "#fb7185", marginTop: 16, fontSize: 14 },
  note: { color: theme.textFaint, fontSize: 12, marginTop: 14, lineHeight: 17 },
});
