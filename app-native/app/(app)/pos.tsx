import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, money } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { takeTapToPayPayment, tapToPayAvailable } from "@/lib/terminal";

// Take an in-person payment with Tap to Pay (POS 6c). The amount → a destination
// charge minted on the server (same split as web) → card collected on the phone.
// On web (or before the dev build) it explains where to tap instead.
export default function Pos() {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = tapToPayAvailable();
  const cents = Math.round((Number(amount) || 0) * 100);

  const take = async () => {
    if (cents < 50) return;
    setBusy(true);
    setError(null);
    const r = await takeTapToPayPayment(cents);
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.error ?? "Payment failed.");
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Take payment", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        {done ? (
          <Card>
            <Text style={styles.doneCheck}>✓</Text>
            <Text style={styles.doneTitle}>Paid {money(cents)}</Text>
            <Text style={styles.doneSub}>Your split is on its way — cash out anytime.</Text>
            <View style={{ height: 14 }} />
            <Button
              label="New payment"
              tone="ghost"
              onPress={() => {
                setDone(false);
                setAmount("");
              }}
            />
          </Card>
        ) : (
          <>
            <Text style={styles.label}>Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={theme.textFaint}
                keyboardType="numeric"
                style={styles.amountInput}
                autoFocus
              />
            </View>

            {!available && (
              <Card style={{ marginTop: 8 }}>
                <Text style={styles.heads}>
                  {Platform.OS === "web"
                    ? "Tap to Pay runs on the phone app. Open Lumenati on your iPhone or Android to tap a card here — or send the client a pay link from the web admin."
                    : "Tap to Pay needs the dev build of the app + Apple/Google enrollment. Until then, send a pay link from the web admin."}
                </Text>
              </Card>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={{ height: 18 }} />
            <Button
              label={busy ? "Tap the card…" : `Charge ${money(cents)}`}
              onPress={take}
              disabled={busy || cents < 50 || !available}
            />
            <Text style={styles.note}>
              Card collected on this phone — nothing is typed. The shop&apos;s cut comes off
              automatically; the rest is yours.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dollar: { color: theme.textDim, fontSize: 40, fontWeight: "700" },
  amountInput: { flex: 1, color: theme.text, fontSize: 56, fontWeight: "800", paddingVertical: 4 },
  heads: { color: theme.textDim, fontSize: 14, lineHeight: 20 },
  note: { color: theme.textFaint, fontSize: 12, marginTop: 14, lineHeight: 17 },
  error: { color: "#fb7185", marginTop: 14, fontSize: 14 },
  doneCheck: { color: theme.good, fontSize: 40, textAlign: "center" },
  doneTitle: { color: theme.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginTop: 8 },
  doneSub: { color: theme.textDim, fontSize: 14, textAlign: "center", marginTop: 6 },
});
