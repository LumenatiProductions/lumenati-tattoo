import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, money } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { tapToPayAvailable } from "@/lib/terminal";
import { useMerch } from "@/lib/merch";
import MerchShelf from "@/components/MerchShelf";
import CashCloseout from "@/components/CashCloseout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import InkWash from "@/components/InkWash";

// Take an in-person payment with Tap to Pay (POS 6c). On real iOS builds the
// native flow renders (components/TapToPayPos); Expo Go / web / Android get an
// honest explainer. The lazy require keeps the native SDK out of Expo Go.
export default function Pos() {
  const insets = useSafeAreaInsets();
  const available = tapToPayAvailable();

  let Real: React.ComponentType | null = null;
  if (available) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Real = require("@/components/TapToPayPos").default as React.ComponentType;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Take payment", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <InkWash />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {Real ? (
            <Real />
          ) : (
            <Fallback />
          )}
        </ScrollView>
      </View>
    </>
  );
}

function Fallback() {
  const { role, email } = useAuth();
  const [amount, setAmount] = useState("");
  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  useEffect(() => {
    if (role !== "artist" || !email) return;
    supabase
      .from("profiles")
      .select("artist_id")
      .eq("email", email)
      .maybeSingle()
      .then(({ data }) => setMyArtistId((data?.artist_id as string | null) ?? null));
  }, [role, email]);
  const cents = Math.round((Number(amount) || 0) * 100);
  // Cash merch works everywhere — it's a books write, no card reader involved.
  const merch = useMerch();
  const [busy, setBusy] = useState(false);
  const [soldCents, setSoldCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const takeCash = async () => {
    setBusy(true);
    setError(null);
    const r = await merch.recordCash();
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not record the sale.");
      return;
    }
    setSoldCents(r.totalCents ?? merch.totals?.totalCents ?? 0);
    merch.clear();
  };

  if (soldCents !== null) {
    return (
      <Card>
        <Text style={styles.doneCheck}>✓</Text>
        <Text style={styles.doneTitle}>Paid {money(soldCents)}</Text>
        <Text style={styles.doneSub}>Cash sale — the books and the stock count are updated.</Text>
        <View style={{ height: 14 }} />
        <Button label="New sale" tone="ghost" onPress={() => setSoldCents(null)} />
      </Card>
    );
  }

  return (
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
      <Card style={{ marginTop: 8 }}>
        <Text style={styles.heads}>
          {Platform.OS === "web"
            ? "Tap to Pay runs on the phone app. Open Lumenati on your iPhone to tap a card here — or send the client a pay link from the web admin."
            : Platform.OS === "android"
              ? "Tap to Pay on Android isn't enrolled yet — use an iPhone or send a pay link from the web admin."
              : "Tap to Pay is in Apple\u2019s final review (flow videos) — it lights up here the day they approve. Until then, send a pay link from the web admin."}
        </Text>
      </Card>
      <MerchShelf
        products={merch.products}
        cart={merch.cart}
        add={merch.add}
        remove={merch.remove}
        totals={merch.totals}
        taxBps={merch.taxBps}
        disabled={busy}
      />
      {myArtistId && cents > 0 && !cashOpen && (
        <View style={{ marginTop: 12 }}>
          <Button label={`Client paid ${money(cents)} cash`} onPress={() => setCashOpen(true)} />
        </View>
      )}
      {myArtistId && cents > 0 && cashOpen && (
        <CashCloseout
          artistId={myArtistId}
          serviceCents={cents}
          onDone={() => {
            setCashOpen(false);
            setAmount("");
          }}
        />
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={{ height: 18 }} />
      {merch.totals ? (
        <Button
          label={busy ? "Recording…" : `Paid cash · ${money(merch.totals.totalCents)}`}
          onPress={takeCash}
          disabled={busy}
        />
      ) : (
        <Button label={`Charge ${money(cents)}`} onPress={() => {}} disabled />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dollar: { color: theme.textDim, fontSize: 40, fontWeight: "700" },
  amountInput: { flex: 1, color: theme.text, fontSize: 56, fontWeight: "800", paddingVertical: 4 },
  heads: { color: theme.textDim, fontSize: 14, lineHeight: 20 },
  error: { color: theme.bad, marginTop: 14, fontSize: 14 },
  doneCheck: { color: theme.good, fontSize: 40, textAlign: "center" },
  doneTitle: { color: theme.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginTop: 8 },
  doneSub: { color: theme.textDim, fontSize: 14, textAlign: "center", marginTop: 6 },
});
