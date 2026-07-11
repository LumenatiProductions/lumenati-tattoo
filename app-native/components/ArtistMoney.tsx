import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { apiPost } from "@/lib/appApi";
import BookingCalendar from "@/components/BookingCalendar";
import { theme, money } from "@/lib/theme";
import { success, tap } from "@/lib/haptics";
import { Button, Card, Stat, SectionTitle, ProgressBar } from "@/components/ui";
import MoneyChart from "@/components/MoneyChart";
import MiniConfetti from "@/components/MiniConfetti";
import RewardsStrip from "@/components/RewardsStrip";
import TodayCard from "@/components/TodayCard";
import { coachTips } from "@/lib/coach";
import { todayLocal } from "@/lib/dates";
import {
  loadMoney,
  rentOnTimeStreak,
  loadGoals,
  loadExpenses,
  loadRent,
  taxStatusForPayType,
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
  type GoalsLoad,
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
  const [goals, setGoals] = useState<GoalsLoad | null>(null);
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

  // Tax: reserve = (earned − deductions) × pct. The tax situation follows the
  // pay setup (renters 1099, payroll artists W-2), but the % is THEIRS — the
  // app assumes nothing until they save one (Scott, 2026-07-09), it only
  // suggests on the Goals screen.
  const ytd = earnedInRange(snap.sales, "year");
  const deductYtd = expensesYtd(expenses);
  const taxable = Math.max(0, ytd.total - deductYtd);
  const taxStatus = taxStatusForPayType(rent?.payType) ?? goals.tax_status;
  const taxPct = goals.saved ? goals.tax_setaside_pct : null;
  const reserve = taxPct == null ? 0 : Math.round(taxable * taxPct);

  return (
    <View>
      <Text style={styles.greeting}>{previewName ?? `Hey ${firstName}`}</Text>

      {/* THE actions — money in, next client on the books. */}
      <Button label="Take payment" big onPress={() => router.push("/pos")} />
      <View style={{ height: 10 }} />
      <Button label="New booking" tone="ghost" onPress={() => router.push("/bookings?new=1")} />

      {/* The day ahead — next client ready before the phone goes back away. */}
      <TodayCard artistId={artistId} reloadKey={reloadKey} />

      {/* Their book as a real calendar — next up, day, week, or month views. */}
      <BookingCalendar artistId={artistId} reloadKey={reloadKey} />

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
        {/* THE number — full-width hero, ticks up, glass not pink. */}
        <Stat label="You earned" value={money(e.total)} countTo={e.total} sub={`${money(e.tips)} tips`} hero />
        <Stat label="Hourly rate" value={hourly == null ? "—" : `${money(hourly)}/hr`} sub="service ÷ booked hrs" />
        <Stat label="Tickets" value={String(e.tickets)} />
        <Stat
          label="Tax reserve"
          value={taxPct == null ? "—" : money(reserve)}
          sub={taxPct == null ? "pick your % in Goals" : `${Math.round(taxPct * 100)}% set-aside`}
          warn={taxPct != null}
        />
      </View>

      {/* Rewards — earned milestones from their own numbers, plus the next to chase */}
      <SectionTitle>Rewards</SectionTitle>
      <RewardsStrip snap={snap} goals={goals} />

      {/* Booth rent — renters only. Billed on its own; never netted. The
          coach line turns rent into per-appointment money (page-walk 3/11). */}
      {rent && rent.payType === "booth_rent" && (
        <>
          <SectionTitle>Booth rent</SectionTitle>
          <Card style={rent.unpaid.length ? { borderColor: "rgba(251,191,36,0.45)" } : undefined}>
            {rent.unpaid.length === 0 ? (
              <Row label={`Paid up · ${money(rent.rentCents)}/mo`} value="✓" strong />
            ) : (
              <>
                {rent.unpaid.map((inv) => {
                  const overdue = !!inv.due_date && inv.due_date < todayLocal();
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
                  Rent is billed on its own — it is never taken out of your sales, and your card
                  money passes through to you 100%.
                </Text>
                <RentCoachLine rent={rent} bookings={snap.bookings} />
                <View style={{ height: 12 }} />
                <PayRentButton unpaid={rent.unpaid} onNote={() => router.push("/rent")} />
              </>
            )}
            {rentOnTimeStreak(rent.history) >= 2 && (
              <Text style={styles.streakLine}>
                {rentOnTimeStreak(rent.history)} months paid on time — keep the run alive.
              </Text>
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
            <ProgressBar pct={goalPct} tone={theme.good} />
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

      {/* The coach — practice reads first (rebooking, open days, best-week
          chase), then the standing money truths. All from their own numbers. */}
      <SectionTitle>Coach</SectionTitle>
      {coachTips({
        sales: snap.sales,
        bookings: snap.bookings,
        expenses,
        weeklyGoalCents: goals.weekly_cents,
        taxPct,
        ytdCents: ytd.total,
        reserveCents: reserve,
        taxStatus,
      })
        .slice(0, 3)
        .map((tip, i) => (
          <Card key={tip.title} style={i > 0 ? { marginTop: 10 } : undefined}>
            <Text style={styles.coachTitle}>{tip.title}</Text>
            <Text style={styles.coachBody}>{tip.body}</Text>
          </Card>
        ))}

      {/* Tax + deductions — per-user (the artist's own; the owner's own in preview) */}
      <SectionTitle right={taxPct != null ? <EditLink label="Edit %" onPress={() => router.push("/goals")} /> : undefined}>Taxes</SectionTitle>
      <Card>
        <Row label={taxStatus === "1099" ? "Earned YTD (1099 basis)" : "Earned YTD"} value={money(ytd.total)} />
        <Row label="Deductions logged" value={money(deductYtd)} />
        {taxPct != null ? (
          <>
            <Row label="Set aside for taxes" value={money(reserve)} strong />
            <Text style={styles.taxNote}>
              Estimate only — not tax advice. Next quarterly estimate: {nextQuarterly()}.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.taxNote}>
              {taxStatus === "1099"
                ? "Nothing is withheld for you anywhere — pick a set-aside % and this tracks the dollars for you. 25-30% is a common starting point; your number is your call."
                : "Gusto withholds from your paychecks. If you want a set-aside for cash tips and side work, pick a % — your call."}
            </Text>
            <View style={{ height: 10 }} />
            <Button label="Set your tax %" tone="ghost" onPress={() => router.push("/goals?mode=tax")} />
          </>
        )}
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

// Pay booth rent from right here (bug f7ca0567): grabs the invoice's hosted
// pay link (same checkout the emailed link opens) and hands it to the browser.
// Oldest month first when more than one is open. No link (Stripe was off when
// it minted) → route to /rent where the cash handoff lives.
function PayRentButton({
  unpaid,
  onNote,
}: {
  unpaid: RentStatus["unpaid"];
  onNote: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const oldest = [...unpaid].sort((a, b) => a.period.localeCompare(b.period))[0];
  if (!oldest) return null;

  const pay = async () => {
    setBusy(true);
    setNote(null);
    const r = await apiPost<{ url: string }>("/api/rent/pay-link", { invoiceId: oldest.id });
    setBusy(false);
    if (r.ok && r.data?.url) {
      Linking.openURL(r.data.url);
      if (unpaid.length > 1) setNote("Paying oldest month first — the next one unlocks here after.");
    } else {
      setNote(r.error ?? "Could not fetch your pay link.");
    }
  };

  return (
    <View>
      <Button
        label={busy ? "Getting your pay link…" : `Pay ${money(oldest.amount_cents)} rent now`}
        onPress={pay}
        disabled={busy}
      />
      <View style={{ height: 8 }} />
      <Button label="Paying cash instead" tone="ghost" onPress={onNote} />
      {note && <Text style={styles.taxNote}>{note}</Text>}
    </View>
  );
}

// Rent as per-appointment money: "you owe $X and have N sessions on the books
// — set aside about $Y each." Advisory only, updates as the book fills.
function RentCoachLine({
  rent,
  bookings,
}: {
  rent: RentStatus;
  bookings: { starts_at: string; status: string }[];
}) {
  const owed = rent.unpaid.reduce((a, i) => a + i.amount_cents, 0);
  if (owed <= 0) return null;
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const upcoming = bookings.filter(
    (b) => b.status === "scheduled" && new Date(b.starts_at) >= now && new Date(b.starts_at) < monthEnd,
  ).length;
  if (upcoming === 0) {
    return (
      <Text style={styles.taxNote}>
        Nothing on the book this month yet — every session you add chips {money(owed)} down.
      </Text>
    );
  }
  const per = Math.ceil(owed / upcoming / 100) * 100;
  return (
    <Text style={styles.taxNote}>
      {upcoming} session{upcoming === 1 ? "" : "s"} on the book this month — set aside about {money(per)} from
      each and rent takes care of itself.
    </Text>
  );
}

// The 7-day bars, tappable: the biggest day starts labeled; tapping any bar
// moves the value bubble to it (selection tick included).
function WeekBars({ bars, maxBar }: { bars: { label: string; cents: number }[]; maxBar: number }) {
  const biggest = bars.reduce((bi, b, i) => (b.cents > bars[bi].cents ? i : bi), 0);
  const [sel, setSel] = useState(biggest);
  const quietWeek = bars.every((b) => !b.cents);
  return (
    <View>
      {quietWeek && <Text style={styles.quietWeek}>Nothing rung up in the last 7 days yet.</Text>}
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
          <Text style={[styles.barValue, (sel !== i || !b.cents) && { opacity: 0 }]}>
            {b.cents ? money(b.cents) : " "}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                {
                  height: `${(b.cents / maxBar) * 100}%`,
                  backgroundColor: b.cents ? theme.good : "rgba(255,255,255,0.08)",
                  opacity: sel === i || !b.cents ? 1 : 0.55,
                },
              ]}
            />
          </View>
          <Text style={[styles.barLabel, sel === i && { color: theme.textDim, fontWeight: "700" }]}>{b.label}</Text>
        </Pressable>
      ))}
      </View>
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
  toggle: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderColor: theme.border, borderWidth: 1 },
  tabOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
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
  editLinkText: { color: theme.text, fontSize: 13, fontWeight: "700" },
  bars: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 110 },
  barCol: { flex: 1, alignItems: "center" },
  barTrack: { height: 90, width: 14, justifyContent: "flex-end", borderRadius: 7, overflow: "hidden" },
  bar: { width: 14, borderRadius: 7, minHeight: 3 },
  barLabel: { color: theme.textFaint, fontSize: 11, marginTop: 6 },
  barValue: { color: theme.text, fontSize: 11, fontWeight: "700", marginBottom: 5, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: theme.textDim, fontSize: 14 },
  rowValue: { color: theme.textDim, fontSize: 15, fontWeight: "600" },
  streakLine: { color: theme.good, fontSize: 13, marginTop: 10, fontWeight: "600" },
  quietWeek: { color: theme.textFaint, fontSize: 12.5, marginBottom: 10 },
  taxNote: { color: theme.textFaint, fontSize: 12, marginTop: 10, lineHeight: 17 },
  linkBtn: { borderColor: theme.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  linkBtnText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  editGoals: { color: theme.text, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
