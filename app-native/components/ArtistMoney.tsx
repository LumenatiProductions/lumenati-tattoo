import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { theme, money } from "@/lib/theme";
import { success, tap } from "@/lib/haptics";
import { Button, Card, Stat, SectionTitle, ProgressBar } from "@/components/ui";
import MoneyChart from "@/components/MoneyChart";
import MiniConfetti from "@/components/MiniConfetti";
import RewardsStrip from "@/components/RewardsStrip";
import TodayCard from "@/components/TodayCard";
import { coachTips } from "@/lib/coach";
import {
  loadMoney,
  loadGoals,
  loadExpenses,
  loadRent,
  type RentStatus,
  cumulativeSeries,
  weeklyStreak,
  earnedInRange,
  hourlyInRange,
  last7Days,
  expensesYtd,
  startOf,
  type Range,
  type MoneySnapshot,
  type Goals,
  type Expense,
} from "@/lib/personal";

const RANGES: Range[] = ["week", "month", "year"];
const RANGE_LABEL: Record<Range, string> = { week: "This week", month: "This month", year: "This year" };
// screen padding (20×2) + card padding (16×2)
const CHART_W = Dimensions.get("window").width - 72;

// The artist money + coaching home. Earnings, realized hourly rate, goal pacing,
// and the tax set-aside — all from their own RLS-scoped data. (POS 6b)
// `artistId` scopes sales/bookings/rent explicitly — used when an owner views
// an artist (preview) or is one themselves (JD: co-owner with a chair).
// `previewName` swaps the greeting for the previewed artist's name.
export default function ArtistMoney({
  firstName,
  artistId,
  previewName,
  reloadKey = 0,
}: {
  firstName: string;
  artistId?: string;
  previewName?: string;
  /** Bumped by the home's pull-to-refresh — reloads everything. */
  reloadKey?: number;
}) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("week");
  const [snap, setSnap] = useState<MoneySnapshot | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rent, setRent] = useState<RentStatus | null>(null);

  const load = useCallback(async () => {
    // Goals/expenses are keyed to the signed-in user; sales/bookings/rent are
    // scoped by RLS for artists or by the explicit artistId for owners.
    const [m, g, e, r] = await Promise.all([
      loadMoney(artistId),
      loadGoals(),
      loadExpenses(),
      loadRent(artistId),
    ]);
    setSnap(m);
    setGoals(g);
    setExpenses(e);
    setRent(r);
  }, [artistId]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // One success buzz the moment the goal line is crossed while on the page
  // (hitRef stops it re-firing every render). Hook lives above the early
  // return, so it guards its own nulls.
  const hitRef = useRef(false);
  const [pop, setPop] = useState(false);
  const liveGoal = goals ? (range === "month" ? goals.monthly_cents : range === "week" ? goals.weekly_cents : 0) : 0;
  const liveEarned = snap ? earnedInRange(snap.sales, range).total : 0;
  const goalHit = liveGoal > 0 && liveEarned >= liveGoal;
  useEffect(() => {
    if (goalHit && !hitRef.current) {
      success();
      setPop(true);
    }
    hitRef.current = goalHit;
  }, [goalHit]);

  if (!snap || !goals) {
    return <Text style={styles.dim}>Loading your numbers…</Text>;
  }

  const e = earnedInRange(snap.sales, range);
  const hourly = hourlyInRange(snap.sales, snap.bookings, range);
  const streak = weeklyStreak(snap.sales, goals.weekly_cents);
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
      <Text style={styles.greeting}>{previewName ?? `Hey ${firstName}`}</Text>

      {/* THE actions — money in, next client on the books. */}
      <Button label="Take payment" big onPress={() => router.push("/pos")} />
      <View style={{ height: 10 }} />
      <Button label="New booking" tone="ghost" onPress={() => router.push("/bookings?new=1")} />
      <Pressable onPress={() => { tap(); router.push("/cashout"); }} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Text style={styles.cashoutLink}>Cash out early →</Text>
      </Pressable>

      {/* The day ahead — next client ready before the phone goes back away. */}
      <TodayCard artistId={artistId} reloadKey={reloadKey} />

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
        <Stat label="You earned" value={money(e.total)} countTo={e.total} sub={`${money(e.tips)} tips`} accent />
        <Stat label="Hourly rate" value={hourly == null ? "—" : `${money(hourly)}/hr`} sub="service ÷ booked hrs" />
        <Stat label="Tickets" value={String(e.tickets)} />
        <Stat label="Tax reserve" value={money(reserve)} sub={`${Math.round(goals.tax_setaside_pct * 100)}% set-aside`} warn />
      </View>

      {/* Rewards — earned milestones from their own numbers, plus the next to chase */}
      <SectionTitle>Rewards</SectionTitle>
      <RewardsStrip snap={snap} goals={goals} />

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

      {/* The race: cumulative earnings vs the goal pace line */}
      <SectionTitle right={goalCents > 0 ? <EditLink label="Edit" onPress={() => router.push("/goals")} /> : undefined}>
        Goal
      </SectionTitle>
      <Card>
        <MoneyChart
          series={cumulativeSeries(snap.sales, range)}
          startLabel={RANGE_LABEL[range].replace("This ", "")}
          endLabel="today"
          startISO={startOf(range)}
          goalCents={goalCents > 0 ? goalCents : undefined}
          streak={streak}
          width={CHART_W}
        />
        {pop && <MiniConfetti onDone={() => setPop(false)} />}
        {goalCents > 0 ? (
          <>
            <View style={[styles.goalRow, { marginTop: 12 }]}>
              <Text style={styles.goalNow}>{money(e.total)}</Text>
              <Text style={styles.goalTarget}>of {money(goalCents)}</Text>
            </View>
            <ProgressBar pct={goalPct} tone={goalPct >= 1 ? theme.good : theme.brand} />
            <Text style={styles.goalNote}>
              {goalPct >= 1 ? "Goal hit — nice." : `${Math.round(goalPct * 100)}% there`}
              {streak >= 2 ? `  ·  ${streak} weeks straight over goal` : ""}
            </Text>
          </>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.goalPitch}>Pick a number to chase and this chart races you against it, every day.</Text>
            <Button label="Set your goals" onPress={() => router.push("/goals")} />
          </View>
        )}
      </Card>

      {/* 7-day strip — tap a bar to see that day's number */}
      <SectionTitle>Last 7 days</SectionTitle>
      <Card>
        <WeekBars bars={bars} maxBar={maxBar} />
      </Card>

      {/* The coach — plain-English money truths from their own numbers. The
          first one is always the same: NOBODY withholds for you. */}
      <SectionTitle>Coach</SectionTitle>
      {coachTips({
        sales: snap.sales,
        expenses,
        weeklyGoalCents: goals.weekly_cents,
        taxPct: goals.tax_setaside_pct,
        ytdCents: ytd.total,
        reserveCents: reserve,
        taxStatus: goals.tax_status,
      })
        .slice(0, 3)
        .map((tip, i) => (
          <Card key={tip.title} style={i > 0 ? { marginTop: 10 } : undefined}>
            <Text style={styles.coachTitle}>{tip.title}</Text>
            <Text style={styles.coachBody}>{tip.body}</Text>
          </Card>
        ))}

      {/* Tax + deductions — per-user (the artist's own; the owner's own in preview) */}
      <SectionTitle right={<EditLink label="Edit %" onPress={() => router.push("/goals")} />}>Taxes</SectionTitle>
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
    </View>
  );
}

// The 7-day bars, tappable: the biggest day starts labeled; tapping any bar
// moves the value bubble to it (selection tick included).
function WeekBars({ bars, maxBar }: { bars: { label: string; cents: number }[]; maxBar: number }) {
  const biggest = bars.reduce((bi, b, i) => (b.cents > bars[bi].cents ? i : bi), 0);
  const [sel, setSel] = useState(biggest);
  return (
    <View style={styles.bars}>
      {bars.map((b, i) => (
        <Pressable
          key={i}
          onPress={() => {
            tap();
            setSel(i);
          }}
          style={styles.barCol}
          hitSlop={6}
        >
          <Text style={[styles.barValue, sel !== i && { opacity: 0 }]}>
            {b.cents ? money(b.cents) : "$0"}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                {
                  height: `${(b.cents / maxBar) * 100}%`,
                  backgroundColor: b.cents ? theme.brand : "rgba(255,255,255,0.08)",
                  opacity: sel === i || !b.cents ? 1 : 0.55,
                },
              ]}
            />
          </View>
          <Text style={[styles.barLabel, sel === i && { color: theme.textDim, fontWeight: "700" }]}>{b.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EditLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [styles.editLink, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.editLinkText}>{label}</Text>
    </Pressable>
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
  greeting: { color: theme.text, fontSize: 28, fontWeight: "700", marginTop: 8, marginBottom: 20 },
  cashoutLink: {
    color: theme.textDim,
    fontSize: 14.5,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 14,
    marginBottom: 8,
  },
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
  goalPitch: { color: theme.textDim, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  coachTitle: { color: theme.text, fontSize: 15.5, fontWeight: "700", marginBottom: 6 },
  coachBody: { color: theme.textDim, fontSize: 13.5, lineHeight: 19 },
  editLink: { paddingHorizontal: 2 },
  editLinkText: { color: theme.brand, fontSize: 13, fontWeight: "700" },
  bars: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 110 },
  barCol: { flex: 1, alignItems: "center" },
  barTrack: { height: 90, width: 14, justifyContent: "flex-end", borderRadius: 7, overflow: "hidden" },
  bar: { width: 14, borderRadius: 7, minHeight: 3 },
  barLabel: { color: theme.textFaint, fontSize: 11, marginTop: 6 },
  barValue: { color: theme.text, fontSize: 11, fontWeight: "700", marginBottom: 5, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: theme.textDim, fontSize: 14 },
  rowValue: { color: theme.textDim, fontSize: 15, fontWeight: "600" },
  taxNote: { color: theme.textFaint, fontSize: 12, marginTop: 10, lineHeight: 17 },
  linkBtn: { borderColor: theme.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  linkBtnText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  editGoals: { color: theme.brand, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
