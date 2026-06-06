import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { theme, money } from "@/lib/theme";
import { Card, Stat, SectionTitle, ProgressBar } from "@/components/ui";
import {
  loadMoney,
  loadGoals,
  loadExpenses,
  earnedInRange,
  hourlyInRange,
  last7Days,
  expensesYtd,
  type Range,
  type MoneySnapshot,
  type Goals,
  type Expense,
} from "@/lib/personal";

const RANGES: Range[] = ["week", "month", "year"];
const RANGE_LABEL: Record<Range, string> = { week: "This week", month: "This month", year: "This year" };

// The artist money + coaching home. Earnings, realized hourly rate, goal pacing,
// and the tax set-aside — all from their own RLS-scoped data. (POS 6b)
export default function ArtistMoney({ firstName }: { firstName: string }) {
  const [range, setRange] = useState<Range>("week");
  const [snap, setSnap] = useState<MoneySnapshot | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const load = useCallback(async () => {
    const [m, g, e] = await Promise.all([loadMoney(), loadGoals(), loadExpenses()]);
    setSnap(m);
    setGoals(g);
    setExpenses(e);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!snap || !goals) {
    return <Text style={styles.dim}>Loading your numbers…</Text>;
  }

  const e = earnedInRange(snap.sales, range);
  const hourly = hourlyInRange(snap.sales, snap.bookings, range);
  const goalCents = range === "month" ? goals.monthly_cents : range === "week" ? goals.weekly_cents : 0;
  const goalPct = goalCents > 0 ? e.total / goalCents : 0;
  const bars = last7Days(snap.sales);
  const maxBar = Math.max(1, ...bars.map((b) => b.cents));

  // Tax: YTD earned is the ~1099 number; reserve = (earned − deductions) × pct.
  const ytd = earnedInRange(snap.sales, "year");
  const deductYtd = expensesYtd(expenses);
  const taxable = Math.max(0, ytd.total - deductYtd);
  const reserve = Math.round(taxable * goals.tax_setaside_pct);

  return (
    <View>
      <Text style={styles.greeting}>Hey {firstName}</Text>

      {/* Range toggle */}
      <View style={styles.toggle}>
        {RANGES.map((r) => (
          <Pressable
            key={r}
            onPress={() => setRange(r)}
            style={[styles.tab, range === r && styles.tabOn]}
          >
            <Text style={[styles.tabText, range === r && styles.tabTextOn]}>{RANGE_LABEL[r]}</Text>
          </Pressable>
        ))}
      </View>

      {/* Primary actions: take a payment, cash out */}
      <View style={styles.actions}>
        <Link href="/pos" asChild>
          <Pressable style={styles.actionPrimary}>
            <Text style={styles.actionPrimaryText}>Take payment</Text>
          </Pressable>
        </Link>
        <Link href="/cashout" asChild>
          <Pressable style={styles.actionGhost}>
            <Text style={styles.actionGhostText}>Cash out</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.grid}>
        <Stat label="You earned" value={money(e.total)} sub={`${money(e.tips)} tips`} accent />
        <Stat label="Hourly rate" value={hourly == null ? "—" : `${money(hourly)}/hr`} sub="service ÷ booked hrs" />
        <Stat label="Tickets" value={String(e.tickets)} />
        <Stat label="Tax reserve" value={money(reserve)} sub={`${Math.round(goals.tax_setaside_pct * 100)}% set-aside`} warn />
      </View>

      {/* Goal pacing */}
      {goalCents > 0 && (
        <>
          <SectionTitle>Goal</SectionTitle>
          <Card>
            <View style={styles.goalRow}>
              <Text style={styles.goalNow}>{money(e.total)}</Text>
              <Text style={styles.goalTarget}>of {money(goalCents)}</Text>
            </View>
            <ProgressBar pct={goalPct} tone={goalPct >= 1 ? theme.good : theme.brand} />
            <Text style={styles.goalNote}>
              {goalPct >= 1 ? "Goal hit — nice." : `${Math.round(goalPct * 100)}% there`}
            </Text>
          </Card>
        </>
      )}

      {/* 7-day strip */}
      <SectionTitle>Last 7 days</SectionTitle>
      <Card>
        <View style={styles.bars}>
          {bars.map((b, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${(b.cents / maxBar) * 100}%`, backgroundColor: b.cents ? theme.brand : "rgba(255,255,255,0.08)" },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{b.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Tax + deductions */}
      <SectionTitle>Taxes</SectionTitle>
      <Card>
        <Row label="Earned YTD (1099 basis)" value={money(ytd.total)} />
        <Row label="Deductions logged" value={money(deductYtd)} />
        <Row label="Set aside for taxes" value={money(reserve)} strong />
        <Text style={styles.taxNote}>
          Estimate only — not tax advice. Next quarterly estimate: {nextQuarterly()}.
        </Text>
        <View style={{ height: 10 }} />
        <Link href="/expenses" asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>Log a deduction →</Text>
          </Pressable>
        </Link>
      </Card>

      <View style={{ height: 14 }} />
      <Link href="/goals" asChild>
        <Pressable>
          <Text style={styles.editGoals}>Edit goals &amp; tax %</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && { color: theme.text }]}>{label}</Text>
      <Text style={[styles.rowValue, strong && { color: theme.text, fontWeight: "800" }]}>{value}</Text>
    </View>
  );
}

// Next IRS estimated-tax due date (Apr 15 / Jun 15 / Sep 15 / Jan 15).
function nextQuarterly(): string {
  const now = new Date();
  const y = now.getFullYear();
  const dates = [new Date(y, 3, 15), new Date(y, 5, 15), new Date(y, 8, 15), new Date(y + 1, 0, 15)];
  const next = dates.find((d) => d >= now) ?? dates[0];
  return next.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  dim: { color: theme.textDim, marginTop: 40, textAlign: "center" },
  greeting: { color: theme.text, fontSize: 28, fontWeight: "700", marginTop: 8, marginBottom: 16 },
  actions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionPrimary: { flex: 2, backgroundColor: theme.brand, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  actionPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  actionGhost: { flex: 1, borderColor: theme.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  actionGhostText: { color: theme.text, fontSize: 15, fontWeight: "600" },
  toggle: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderColor: theme.border, borderWidth: 1 },
  tabOn: { backgroundColor: theme.brand, borderColor: theme.brand },
  tabText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  tabTextOn: { color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  goalRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 10 },
  goalNow: { color: theme.text, fontSize: 24, fontWeight: "800" },
  goalTarget: { color: theme.textDim, fontSize: 14 },
  goalNote: { color: theme.textFaint, fontSize: 12, marginTop: 8 },
  bars: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 110 },
  barCol: { flex: 1, alignItems: "center" },
  barTrack: { height: 90, width: 14, justifyContent: "flex-end", borderRadius: 7, overflow: "hidden" },
  bar: { width: 14, borderRadius: 7, minHeight: 3 },
  barLabel: { color: theme.textFaint, fontSize: 11, marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: theme.textDim, fontSize: 14 },
  rowValue: { color: theme.textDim, fontSize: 15, fontWeight: "600" },
  taxNote: { color: theme.textFaint, fontSize: 12, marginTop: 10, lineHeight: 17 },
  linkBtn: { borderColor: theme.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  linkBtnText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  editGoals: { color: theme.brand, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
