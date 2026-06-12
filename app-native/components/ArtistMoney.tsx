import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { theme, money } from "@/lib/theme";
import { tap } from "@/lib/haptics";
import { Card, Stat, SectionTitle, ProgressBar } from "@/components/ui";
import {
  loadMoney,
  loadGoals,
  loadExpenses,
  loadRent,
  type RentStatus,
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
// `preview` = an owner looking at an artist's home: earnings render from that
// artist's rows; goals/deductions/taxes are the artist's PRIVATE data and stay
// hidden.
export default function ArtistMoney({
  firstName,
  preview,
}: {
  firstName: string;
  preview?: { artistId: string; name: string };
}) {
  const [range, setRange] = useState<Range>("week");
  const [snap, setSnap] = useState<MoneySnapshot | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rent, setRent] = useState<RentStatus | null>(null);

  const load = useCallback(async () => {
    // Preview (owner): earnings come from THAT artist's rows; goals/expenses
    // are per-user so the owner sees + edits their own — good enough to learn
    // the flow while the roster has no real artists on it yet.
    const [m, g, e, r] = await Promise.all([
      loadMoney(preview?.artistId),
      loadGoals(),
      loadExpenses(),
      loadRent(preview?.artistId),
    ]);
    setSnap(m);
    setGoals(g);
    setExpenses(e);
    setRent(r);
  }, [preview]);
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
      <Text style={styles.greeting}>{preview ? preview.name : `Hey ${firstName}`}</Text>

      {/* THE action — taking money is why the phone comes out of the pocket. */}
      <Link href="/pos" asChild>
        <Pressable
          onPress={() => tap()}
          style={({ pressed }) => [styles.hero, theme.glow, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]}
        >
          <Text style={styles.heroText}>Take payment</Text>
          <Text style={styles.heroSub}>Tap to Pay on this phone</Text>
        </Pressable>
      </Link>
      <Link href="/cashout" asChild>
        <Pressable onPress={() => tap()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Text style={styles.cashoutLink}>Cash out →</Text>
        </Pressable>
      </Link>

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

      <View style={styles.grid}>
        <Stat label="You earned" value={money(e.total)} sub={`${money(e.tips)} tips`} accent />
        <Stat label="Hourly rate" value={hourly == null ? "—" : `${money(hourly)}/hr`} sub="service ÷ booked hrs" />
        <Stat label="Tickets" value={String(e.tickets)} />
        <Stat label="Tax reserve" value={money(reserve)} sub={`${Math.round(goals.tax_setaside_pct * 100)}% set-aside`} warn />
      </View>

      {/* Booth rent — only for artists whose terms include rent */}
      {rent && rent.payType !== "split" && (
        <>
          <SectionTitle>Booth rent</SectionTitle>
          <Card style={rent.unpaid.length ? { borderColor: "rgba(251,191,36,0.45)" } : undefined}>
            {rent.unpaid.length === 0 ? (
              <Row label={`Paid up · ${money(rent.rentCents)}/mo`} value="✓" strong />
            ) : (
              <>
                {rent.unpaid.map((inv) => {
                  const overdue = !!inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10);
                  return (
                    <Row
                      key={inv.id}
                      label={`${periodLabel(inv.period)}${inv.due_date ? ` · due ${inv.due_date.slice(5)}` : ""}${overdue ? " · OVERDUE" : ""}`}
                      value={money(inv.amount_cents)}
                      strong={overdue}
                    />
                  );
                })}
                <Text style={styles.taxNote}>
                  Owed to the shop{rent.unpaid.length > 1 ? ` — ${money(rent.unpaid.reduce((a, i) => a + i.amount_cents, 0))} total` : ""}.
                  Pay at the desk or with your rent link; it never comes out of your card payouts.
                </Text>
              </>
            )}
          </Card>
        </>
      )}

      {preview && (
        <Text style={styles.previewNote}>
          Earnings above are {preview.name}&apos;s. Goals, deductions and taxes below are YOURS
          (each artist gets their own private set) — set a goal to see how the pacing works.
        </Text>
      )}

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

      {/* Tax + deductions — per-user (the artist's own; the owner's own in preview) */}
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

// "2026-06" → "June 2026" for the rent rows.
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
  greeting: { color: theme.text, fontSize: 28, fontWeight: "700", marginTop: 10, marginBottom: 20 },
  hero: {
    backgroundColor: theme.brand,
    borderRadius: theme.radius.xl,
    paddingVertical: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  heroText: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600" },
  cashoutLink: {
    color: theme.textDim,
    fontSize: 14.5,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 14,
    marginBottom: 8,
  },
  previewNote: { color: theme.textFaint, fontSize: 12.5, marginTop: 18, lineHeight: 17 },
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
