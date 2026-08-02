import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, money } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { Button, Card } from "@/components/ui";
import { addExpense, deleteExpense, loadExpenses, expensesYtd, type Expense } from "@/lib/personal";
import { snapReceipt } from "@/lib/vision";
import { todayLocal } from "@/lib/dates";

const CATEGORIES = ["supplies", "equipment", "rent", "education", "travel", "other"];

// Deduction log — the artist's own business expenses (ink, needles, booth rent,
// classes). Feeds the tax reserve on the money home. (POS 6b)
export default function Expenses() {
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("supplies");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true);
    setScanNote(null);
    const r = await snapReceipt();
    setScanning(false);
    if (r.ok && r.receipt) {
      if (r.receipt.amountCents) setAmount((r.receipt.amountCents / 100).toFixed(2));
      if (r.receipt.vendor) setVendor(r.receipt.vendor);
      if (r.receipt.category) setCategory(r.receipt.category);
      setScanNote("Read your receipt, check the fields and tap Add.");
    } else if (r.error && r.error !== "canceled") {
      setScanNote(r.error);
    }
  };

  const load = useCallback(async () => setExpenses(await loadExpenses()), []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const cents = Math.round((Number(amount) || 0) * 100);
    if (cents < 1) return;
    setBusy(true);
    await addExpense({
      date: todayLocal(),
      category,
      vendor: vendor.trim() || undefined,
      amountCents: cents,
    });
    setBusy(false);
    setAmount("");
    setVendor("");
    await load();
  };

  const remove = async (id: string) => {
    setExpenses((p) => p.filter((e) => e.id !== id));
    await deleteExpense(id);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Deductions", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <Card>
          <Text style={styles.ytd}>{money(expensesYtd(expenses))}</Text>
          <Text style={styles.ytdLabel}>deducted this year</Text>
        </Card>

        <Text style={styles.section}>Add a deduction</Text>
        <Button label={scanning ? "Reading…" : "Snap a receipt"} tone="ghost" onPress={scan} disabled={scanning} />
        {scanNote && <Text style={styles.scanNote}>{scanNote}</Text>}
        <View style={{ height: 10 }} />
        <View style={styles.formRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="$ amount"
            placeholderTextColor={theme.textFaint}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={vendor}
            onChangeText={setVendor}
            placeholder="vendor (optional)"
            placeholderTextColor={theme.textFaint}
            style={[styles.input, { flex: 1.4 }]}
          />
        </View>
        <View style={styles.cats}>
          {CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.cat, category === c && styles.catOn]}>
              <Text style={[styles.catText, category === c && { color: "#fff" }]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <Button label={busy ? "Adding…" : "Add deduction"} onPress={add} disabled={busy} />

        <Text style={styles.section}>Logged</Text>
        {expenses.length === 0 ? (
          <Text style={styles.empty}>Nothing logged yet. Ink, needles, booth rent, classes. It all counts.</Text>
        ) : (
          <Card style={{ padding: 0 }}>
            {expenses.map((e, i) => (
              <View key={e.id} style={[styles.item, i > 0 && styles.itemBorder]}>
                <View>
                  <Text style={styles.itemTop}>
                    {money(e.amount_cents)} · {e.category}
                  </Text>
                  <Text style={styles.itemSub}>
                    {e.date}
                    {e.vendor ? ` · ${e.vendor}` : ""}
                  </Text>
                </View>
                <Pressable onPress={() => remove(e.id)}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  ytd: { color: theme.text, fontSize: 30, fontWeight: "800" },
  ytdLabel: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  section: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "600", marginTop: 24, marginBottom: 10 },
  formRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  cat: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, borderColor: theme.border, borderWidth: 1 },
  catOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  catText: { color: theme.textDim, fontSize: 13 },
  scanNote: { color: theme.textDim, fontSize: 13, marginTop: 8, lineHeight: 18 },
  empty: { color: theme.textFaint, fontSize: 14, lineHeight: 20 },
  item: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  itemBorder: { borderTopColor: theme.border, borderTopWidth: 1 },
  itemTop: { color: theme.text, fontSize: 15, fontWeight: "600" },
  itemSub: { color: theme.textFaint, fontSize: 12, marginTop: 2 },
  remove: { color: theme.textFaint, fontSize: 13 },
});
