import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/lib/theme";
import { Button } from "@/components/ui";
import { loadGoals, saveGoals } from "@/lib/personal";

// Set income targets + the tax set-aside %. (POS 6b)
export default function Goals() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [weekly, setWeekly] = useState("");
  const [monthly, setMonthly] = useState("");
  const [taxPct, setTaxPct] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGoals().then((g) => {
      if (g.weekly_cents) setWeekly(String(g.weekly_cents / 100));
      if (g.monthly_cents) setMonthly(String(g.monthly_cents / 100));
      setTaxPct(String(Math.round(g.tax_setaside_pct * 100)));
    });
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    const pct = Math.max(0, Math.min(100, Number(taxPct) || 0)) / 100;
    const res = await saveGoals({
      weekly_cents: Math.round((Number(weekly) || 0) * 100),
      monthly_cents: Math.round((Number(monthly) || 0) * 100),
      tax_setaside_pct: pct,
    });
    setBusy(false);
    if (res.ok) router.back();
    else setError(res.error ?? "Could not save.");
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Goals", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <Field label="Weekly income goal ($)" value={weekly} onChange={setWeekly} placeholder="2000" />
        <Field label="Monthly income goal ($)" value={monthly} onChange={setMonthly} placeholder="8000" />
        <Field label="Set aside for taxes (%)" value={taxPct} onChange={setTaxPct} placeholder="30" />
        <Text style={styles.help}>
          A common starting point is 25–30%. Adjust with your tax pro — this app estimates, it doesn&apos;t file.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={{ height: 18 }} />
        <Button label={busy ? "Saving…" : "Save"} onPress={save} disabled={busy} />
      </ScrollView>
    </>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        keyboardType="numeric"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 13, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  help: { color: theme.textFaint, fontSize: 13, lineHeight: 18, marginTop: 4 },
  error: { color: "#fb7185", marginTop: 12 },
});
