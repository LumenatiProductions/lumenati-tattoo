import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, money } from "@/lib/theme";
import { Button } from "@/components/ui";
import { Chips } from "@/components/form";
import GoalDial from "@/components/GoalDial";
import { loadGoals, loadMoney, saveGoals } from "@/lib/personal";
import { avgWeeklyCents, suggestedWeeklyCents } from "@/lib/coach";
import { milestone } from "@/lib/haptics";

// Set income targets + the tax set-aside % on the dial — drag, feel the
// detents, watch it warm from pink to green. (POS 6b, dopamine pass)

type Mode = "weekly" | "monthly" | "tax";
const MODE_LABEL: Record<Mode, string> = { weekly: "Weekly", monthly: "Monthly", tax: "Tax %" };

const DIAL: Record<Mode, { min: number; max: number; step: number; caption: string }> = {
  weekly: { min: 0, max: 500000, step: 5000, caption: "per week" },
  monthly: { min: 0, max: 2000000, step: 25000, caption: "per month" },
  tax: { min: 0, max: 50, step: 1, caption: "set aside for taxes" },
};

export default function Goals() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("weekly");
  const [weekly, setWeekly] = useState(0); // cents
  const [monthly, setMonthly] = useState(0); // cents
  const [taxPct, setTaxPct] = useState(30); // whole %
  const [taxStatus, setTaxStatus] = useState<"1099" | "w2">("1099");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(0);
  const [avgWeek, setAvgWeek] = useState(0);

  useEffect(() => {
    loadGoals().then((g) => {
      setWeekly(g.weekly_cents);
      setMonthly(g.monthly_cents);
      setTaxPct(Math.round(g.tax_setaside_pct * 100));
      setTaxStatus(g.tax_status);
    });
    // Coach: a suggestion grounded in their own last two months.
    loadMoney().then((m) => {
      setSuggested(suggestedWeeklyCents(m.sales));
      setAvgWeek(avgWeeklyCents(m.sales));
    });
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await saveGoals({
      weekly_cents: weekly,
      monthly_cents: monthly,
      tax_setaside_pct: Math.max(0, Math.min(100, taxPct)) / 100,
      tax_status: taxStatus,
    });
    setBusy(false);
    if (res.ok) router.back();
    else setError(res.error ?? "Could not save.");
  };

  // Weekly and monthly are ONE income goal seen two ways (52 weeks / 12
  // months ≈ ×4.33) — turn either dial and the other follows.
  const setLinkedWeekly = (w: number) => {
    setWeekly(w);
    setMonthly(Math.round((w * 52) / 12 / DIAL.monthly.step) * DIAL.monthly.step);
  };
  const setLinkedMonthly = (m: number) => {
    setMonthly(m);
    setWeekly(Math.round((m * 12) / 52 / DIAL.weekly.step) * DIAL.weekly.step);
  };

  const d = DIAL[mode];
  const value = mode === "weekly" ? weekly : mode === "monthly" ? monthly : taxPct;
  const set = mode === "weekly" ? setLinkedWeekly : mode === "monthly" ? setLinkedMonthly : setTaxPct;
  const fmt = (v: number) => (mode === "tax" ? `${v}%` : money(v));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Goals", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Chips value={mode} options={["weekly", "monthly", "tax"] as Mode[]} display={(m) => MODE_LABEL[m]} onChange={setMode} />
        </View>

        <GoalDial
          key={mode}
          value={value}
          min={d.min}
          max={d.max}
          step={d.step}
          format={fmt}
          caption={d.caption}
          onChange={set}
        />

        {mode === "weekly" && suggested > 0 && weekly !== suggested && (
          <View style={{ alignItems: "center", marginTop: 6 }}>
            <Button
              label={`Use suggested · ${money(suggested)}/week`}
              tone="ghost"
              onPress={() => {
                milestone();
                setLinkedWeekly(suggested);
              }}
            />
            <Text style={styles.suggestWhy}>
              Your average week lately is {money(avgWeek)} — this is that plus a stretch.
            </Text>
          </View>
        )}

        {/* the other two at a glance */}
        <View style={styles.summary}>
          <Summary label="Weekly" value={weekly ? money(weekly) : "—"} on={mode === "weekly"} />
          <Summary label="Monthly" value={monthly ? money(monthly) : "—"} on={mode === "monthly"} />
          <Summary label="Tax" value={`${taxPct}%`} on={mode === "tax"} />
        </View>

        {mode === "tax" && (
          <View style={{ marginTop: 16 }}>
            <Chips
              label="How are you paid?"
              value={taxStatus}
              options={["1099", "w2"] as const}
              display={(v) => (v === "1099" ? "Contractor (1099)" : "Employee (W-2)")}
              onChange={setTaxStatus}
            />
            <Text style={styles.help}>
              {taxStatus === "1099"
                ? "Booth renters and most split artists are contractors: nothing is withheld for you, so the set-aside % is your tax money — move it to its own account every payout."
                : "Employees get payroll withholding on wages — your W-4 in Gusto controls how much. Keep a smaller set-aside here for cash tips and side work, which usually have nothing withheld."}
            </Text>
          </View>
        )}

        <Text style={styles.help}>
          Weekly and monthly stay in sync — they&apos;re one goal, two views. A common tax
          starting point is 25–30%; adjust with your tax pro — this app estimates, it doesn&apos;t file.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={{ height: 14 }} />
        <Button label={busy ? "Saving…" : "Save goals"} onPress={save} disabled={busy} />
      </ScrollView>
    </>
  );
}

function Summary({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <View style={[styles.sumCell, on && { borderColor: theme.borderStrong, backgroundColor: theme.surfaceRaised }]}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", gap: 10, marginTop: 18 },
  sumCell: {
    flex: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  sumLabel: { color: theme.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700" },
  sumValue: { color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 3, fontVariant: ["tabular-nums"] },
  help: { color: theme.textFaint, fontSize: 12.5, lineHeight: 18, marginTop: 16 },
  suggestWhy: { color: theme.textFaint, fontSize: 12, marginTop: 8, textAlign: "center" },
  error: { color: theme.bad, fontSize: 13.5, marginTop: 12 },
});
