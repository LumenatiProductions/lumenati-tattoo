import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, money } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { tapToPayAvailable } from "@/lib/terminal";

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
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {Real ? (
          <Real />
        ) : (
          <Fallback />
        )}
      </ScrollView>
    </>
  );
}

function Fallback() {
  const [amount, setAmount] = useState("");
  const cents = Math.round((Number(amount) || 0) * 100);
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
              : "Tap to Pay needs the installed app (TestFlight build), not Expo Go."}
        </Text>
      </Card>
      <View style={{ height: 18 }} />
      <Button label={`Charge ${money(cents)}`} onPress={() => {}} disabled />
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dollar: { color: theme.textDim, fontSize: 40, fontWeight: "700" },
  amountInput: { flex: 1, color: theme.text, fontSize: 56, fontWeight: "800", paddingVertical: 4 },
  heads: { color: theme.textDim, fontSize: 14, lineHeight: 20 },
});
