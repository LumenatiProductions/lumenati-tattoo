import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { tap } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";
import { Button, Card, ProgressBar, SectionTitle, Stat } from "@/components/ui";
import TabToggle from "@/components/TabToggle";
import MoneyChart from "@/components/MoneyChart";
import WeekBars from "@/components/WeekBars";
import GoalDial from "@/components/GoalDial";
import CoachDeck from "@/components/CoachDeck";
import { cumulativeSeries, daysInRange, earnedInRange, last7Days, startOf, type Range } from "@/lib/personal";
import { loadShopMoney, shopCoachTips, type ShopMoney } from "@/lib/shop-coach";

type StaffStats = {
  apptsToday: number;
  checkedIn: number;
  lowNames: string[];
  outNames: string[];
  followupsDue: number;
  depositsHeld: number;
  expired: number;
  expiringSoon: number;
  rentOutstanding: number;
  waitlist: number;
};

type Sev = "high" | "med" | "low";
const SEV_COLOR: Record<Sev, string> = { high: theme.bad, med: theme.warn, low: theme.textFaint };
type AttnItem = { icon: keyof typeof Ionicons.glyphMap; text: string; detail?: string; sev: Sev; href: string };

const RANGES: Range[] = ["week", "month", "year"];
const RANGE_LABEL: Record<Range, string> = { week: "This week", month: "This month", year: "This year" };
// screen padding (20×2) + card padding (16×2)
const CHART_W = Dimensions.get("window").width - 72;

// The owner's cockpit, split across the tab bar. "today" = what needs a
// decision, the shop's number this week, every chair, one coach line. "money"
// = the range toggle, the full grid, the goal race, the 7-day strip, the coach
// deck. Same load either way (Scott, 2026-09-01: one range per screen, no
// six-screen scroll).
export default function ShopHome({
  firstName,
  role,
  reloadKey,
  section = "today",
}: {
  firstName: string;
  role: string | null;
  reloadKey: number;
  section?: "today" | "money";
}) {
  const { shopId } = useAuth();
  const router = useRouter();
  const { setPreview } = usePreview();
  const [range, setRange] = useState<Range>("week");
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [money2, setMoney2] = useState<ShopMoney | null>(null);
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [shopRow, setShopRow] = useState<{ id: string; goal_weekly_cents: number } | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [draftGoal, setDraftGoal] = useState(0);
  const ops = role === "owner";
  // Today reads one range: this week. Money lets them move it.
  const liveRange: Range = section === "today" ? "week" : range;

  useEffect(() => {
    if (!shopId) return;
    (async () => {
      const nowIso = new Date().toISOString();
      // Today on the phone's clock, as real instants. A bare date string
      // compares as UTC midnight, which cut the evening off the day (6:30 PM
      // Denver is past "T23:59:59" UTC) and undercounted "appointments today".
      const n = new Date();
      const dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const [shopMoney, apptRes, invRes, fuRes, heldRes, compRes, artistsRes, shopRes, rentRes, waitRes] =
        await Promise.all([
          loadShopMoney(),
          supabase
            .from("bookings")
            .select("checked_in_at, status")
            .gte("starts_at", dayStart.toISOString())
            .lt("starts_at", dayEnd.toISOString())
            .neq("status", "cancelled"),
          supabase.from("inventory_items").select("name, qty, reorder_at"),
          supabase.from("followups").select("id", { count: "exact", head: true }).eq("status", "pending").lte("scheduled_for", nowIso),
          supabase.from("bookings").select("deposit_cents").eq("deposit_status", "held"),
          supabase.from("compliance_items").select("status").in("status", ["expiring", "expired"]),
          supabase.from("artists").select("id, name").eq("shop_id", shopId!).eq("active", true).order("sort"),
          supabase.from("shops").select("id, goal_weekly_cents").eq("id", shopId!).maybeSingle(),
          supabase.from("rent_invoices").select("amount_cents").eq("status", "pending"),
          supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("active", true),
        ]);
      const appts = (apptRes.data ?? []) as { checked_in_at: string | null; status: string }[];
      const inv = (invRes.data ?? []) as { name: string; qty: number; reorder_at: number }[];
      const held = (heldRes.data ?? []) as { deposit_cents: number }[];
      const comp = (compRes.data ?? []) as { status: string }[];
      const low = inv.filter((i) => Number(i.qty) <= Number(i.reorder_at));
      setMoney2(shopMoney);
      setArtists((artistsRes.data ?? []) as { id: string; name: string }[]);
      const sr = shopRes.data as { id: string; goal_weekly_cents?: number } | null;
      setShopRow(sr ? { id: sr.id, goal_weekly_cents: sr.goal_weekly_cents ?? 0 } : null);
      setStats({
        apptsToday: appts.length,
        // "Done" = checked in at the kiosk OR already completed at the chair; a
        // finished session without a kiosk tap still counts (lum-036).
        checkedIn: appts.filter((b) => b.checked_in_at || b.status === "completed").length,
        lowNames: low.filter((i) => Number(i.qty) > 0).map((i) => i.name),
        outNames: low.filter((i) => Number(i.qty) <= 0).map((i) => i.name),
        followupsDue: (fuRes as { count?: number }).count ?? 0,
        depositsHeld: held.reduce((a, h) => a + (h.deposit_cents ?? 0), 0),
        expired: comp.filter((c) => c.status === "expired").length,
        expiringSoon: comp.filter((c) => c.status === "expiring").length,
        rentOutstanding: ((rentRes.data ?? []) as { amount_cents: number }[]).reduce((a, r) => a + r.amount_cents, 0),
        waitlist: (waitRes as { count?: number }).count ?? 0,
      });
    })();
  }, [reloadKey, shopId]);

  const artistNames = useMemo(() => new Map(artists.map((a) => [a.id, a.name])), [artists]);

  // Every chair's take for the range, biggest first — the whole roster shows,
  // including a quiet chair at $0 (that IS the read).
  const chairs = useMemo(() => {
    if (!money2) return [];
    const from = startOf(liveRange);
    const byArtist = new Map<string, { cents: number; tickets: number }>();
    for (const s of money2.sales) {
      if (!s.artist_id || (s.created_at || "").slice(0, 10) < from) continue;
      const cell = byArtist.get(s.artist_id) ?? { cents: 0, tickets: 0 };
      cell.cents += (s.service_cents ?? 0) + (s.tip_cents ?? 0);
      cell.tickets += 1;
      byArtist.set(s.artist_id, cell);
    }
    return artists
      .map((a) => ({ ...a, cents: byArtist.get(a.id)?.cents ?? 0, tickets: byArtist.get(a.id)?.tickets ?? 0 }))
      .sort((a, b) => b.cents - a.cents);
  }, [money2, artists, liveRange]);

  if (!stats || !money2) {
    return (
      <View>
        {section === "today" && <Text style={styles.greeting}>Hey {firstName}</Text>}
        <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const e = earnedInRange(money2.sales, liveRange);
  const from = startOf(liveRange);
  const inRange = money2.sales.filter((s) => (s.created_at || "").slice(0, 10) >= from);
  const card = inRange.filter((s) => s.method !== "cash").reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
  const cash = inRange.filter((s) => s.method === "cash").reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
  const bars = last7Days(money2.sales);

  const weeklyGoal = shopRow?.goal_weekly_cents ?? 0;
  const goalCents =
    liveRange === "week" ? weeklyGoal : liveRange === "month" ? Math.round((weeklyGoal * 52) / 12) : 0;
  const goalPct = goalCents > 0 ? e.total / goalCents : 0;
  const maxChair = Math.max(1, ...chairs.map((c) => c.cents));

  const saveGoal = async () => {
    if (!shopRow) return;
    const prev = shopRow;
    setShopRow({ ...shopRow, goal_weekly_cents: draftGoal });
    setEditingGoal(false);
    const { error } = await supabase
      .from("shops")
      .update({ goal_weekly_cents: draftGoal })
      .eq("id", shopRow.id);
    // Never let the screen show a saved goal that didn't actually save: roll the
    // optimistic update back and tell them, instead of failing silently.
    if (error) {
      setShopRow(prev);
      Alert.alert("Couldn't save your goal", "Something went wrong. Give it another try.");
    }
  };

  const tips = shopCoachTips({
    sales: money2.sales,
    bookings: money2.bookings,
    artistNames,
    activeArtists: artists.length,
    rentOutstandingCents: stats.rentOutstanding,
    followupsDue: stats.followupsDue,
    waitlistCount: stats.waitlist,
  });

  // Ranked like the web cockpit: most urgent first, each row opens where you act.
  const attention: AttnItem[] = [];
  if (role === "owner" && stats.expired)
    attention.push({ icon: "shield-outline", sev: "high", text: `${stats.expired} license/permit expired`, detail: "renew to stay inspection-ready", href: "/compliance" });
  if (ops && stats.outNames.length)
    attention.push({ icon: "cube-outline", sev: "high", text: `${stats.outNames.length} suppl${stats.outNames.length === 1 ? "y" : "ies"} out`, detail: stats.outNames.slice(0, 3).join(", "), href: "/inventory" });
  if (role === "owner" && stats.expiringSoon)
    attention.push({ icon: "shield-outline", sev: "med", text: `${stats.expiringSoon} expiring within 30 days`, href: "/compliance" });
  if (ops && stats.lowNames.length)
    attention.push({ icon: "cube-outline", sev: "med", text: `Reorder: ${stats.lowNames.slice(0, 4).join(", ")}${stats.lowNames.length > 4 ? "…" : ""}`, href: "/inventory" });
  if (ops && stats.followupsDue)
    attention.push({ icon: "chatbubble-ellipses-outline", sev: "med", text: `${stats.followupsDue} follow-up${stats.followupsDue === 1 ? "" : "s"} due`, href: "/followups" });
  if (ops && stats.rentOutstanding)
    attention.push({ icon: "home-outline", sev: "med", text: `${money(stats.rentOutstanding)} booth rent outstanding`, href: "/rent" });
  if (stats.apptsToday)
    attention.push({ icon: "calendar-outline", sev: "low", text: `${stats.apptsToday} appointment${stats.apptsToday === 1 ? "" : "s"} today`, detail: `${stats.checkedIn} done or checked in`, href: "/bookings" });
  if (stats.depositsHeld)
    attention.push({ icon: "card-outline", sev: "low", text: `${money(stats.depositsHeld)} in deposits held`, href: "/bookings" });

  const chairsBlock = (
    <>
      <SectionTitle>Chairs</SectionTitle>
      <Card>
        {chairs.length === 0 ? (
          <Text style={styles.chairEmpty}>No active artists yet.</Text>
        ) : (
          chairs.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => {
                tap();
                setPreview({ artistId: c.id, name: c.name });
              }}
              style={({ pressed }) => [styles.chairRow, i > 0 && styles.chairDivider, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.chairTop}>
                  <Text style={styles.chairName}>{c.name}</Text>
                  <Text style={styles.chairMoney}>
                    {money(c.cents)}
                    <Text style={styles.chairTickets}>{c.tickets ? `  ·  ${c.tickets} ticket${c.tickets === 1 ? "" : "s"}` : ""}</Text>
                  </Text>
                </View>
                <View style={styles.chairTrack}>
                  <View
                    style={[
                      styles.chairFill,
                      { width: `${Math.max(c.cents > 0 ? 3 : 0, (c.cents / maxChair) * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            </Pressable>
          ))
        )}
        <Text style={styles.chairHint}>Tap a chair to view the app as that artist.</Text>
      </Card>
    </>
  );

  if (section === "today") {
    return (
      <View>
        {/* What needs a decision is the very first thing on the page (Scott,
            2026-07-15) — above the greeting, above the numbers. */}
        <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Needs attention</Text>
        {attention.length === 0 ? (
          <View style={styles.allClear}>
            <Ionicons name="checkmark-circle-outline" size={18} color={theme.good} />
            <Text style={styles.allClearText}>All clear, nothing needs a decision.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {attention.map((a, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  tap();
                  router.push(a.href as never);
                }}
                style={({ pressed }) => [styles.attnCard, pressed && { backgroundColor: theme.surfaceRaised }]}
              >
                <View style={[styles.attnRail, { backgroundColor: SEV_COLOR[a.sev] }]} />
                <Ionicons name={a.icon} size={17} color={SEV_COLOR[a.sev]} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.attnText}>{a.text}</Text>
                  {a.detail ? <Text style={styles.attnDetail}>{a.detail}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={15} color={theme.textFaint} />
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.greeting, { marginTop: 24 }]}>Hey {firstName}</Text>
        <Text style={styles.greetSub}>Here&apos;s the shop right now.</Text>

        {/* One number, one range: this week. The Money tab has the rest. */}
        <SectionTitle
          right={
            <Pressable onPress={() => router.push("/money")} hitSlop={8}>
              <Text style={styles.editLink}>All money</Text>
            </Pressable>
          }
        >
          This week
        </SectionTitle>
        <View style={styles.grid}>
          <Stat
            label="Shop earned"
            value={money(e.total)}
            countTo={e.total}
            sub={`${e.tickets} ticket${e.tickets === 1 ? "" : "s"} · ${chairs.filter((c) => c.cents > 0).length}/${artists.length} chairs ringing`}
            hero
            onPress={() => router.push("/money")}
          />
          <Stat
            label="Today"
            value={`${stats.checkedIn}/${stats.apptsToday}`}
            sub="done or checked in"
            onPress={() => router.push("/bookings")}
          />
          <Stat label="Deposits held" value={money(stats.depositsHeld)} onPress={() => router.push("/bookings")} />
        </View>

        {chairsBlock}

        {/* One coach line. The full deck is on Money. */}
        {tips[0] && (
          <>
            <SectionTitle
              right={
                <Pressable onPress={() => router.push("/money")} hitSlop={8}>
                  <Text style={styles.editLink}>More</Text>
                </Pressable>
              }
            >
              Coach
            </SectionTitle>
            <Card>
              <Text style={styles.coachTitle}>{tips[0].title}</Text>
              <Text style={styles.coachBody}>{tips[0].body}</Text>
            </Card>
          </>
        )}
      </View>
    );
  }

  return (
    <View>
      {/* Range toggle — same mechanic as the artist page. */}
      <View style={styles.rangeToggle}>
        <TabToggle
          options={RANGES.map((r) => ({ key: r, label: RANGE_LABEL[r] }))}
          value={range}
          onChange={(k) => setRange(k as Range)}
        />
      </View>

      <View style={styles.grid}>
        <Stat
          label="Shop earned"
          value={money(e.total)}
          countTo={e.total}
          sub={`${e.tickets} ticket${e.tickets === 1 ? "" : "s"} · ${chairs.filter((c) => c.cents > 0).length}/${artists.length} chairs ringing`}
          hero
        />
        <Stat label="Service" value={money(e.service)} />
        <Stat label="Tips" value={money(e.tips)} />
        <Stat label="Card" value={money(card)} />
        <Stat label="Cash" value={money(cash)} />
        <Stat label="Deposits held" value={money(stats.depositsHeld)} onPress={() => router.push("/bookings")} />
        {ops && (
          <>
            <Stat
              label="Rent outstanding"
              value={money(stats.rentOutstanding)}
              warn={stats.rentOutstanding > 0}
              onPress={() => router.push("/rent")}
            />
            <Stat
              label="Low stock"
              value={String(stats.lowNames.length + stats.outNames.length)}
              warn={stats.lowNames.length + stats.outNames.length > 0}
              onPress={() => router.push("/inventory")}
            />
          </>
        )}
      </View>

      {/* The race: shop revenue vs the goal pace line. */}
      <SectionTitle
        right={
          weeklyGoal > 0 && !editingGoal ? (
            <Pressable
              onPress={() => {
                setDraftGoal(weeklyGoal);
                setEditingGoal(true);
              }}
              hitSlop={8}
            >
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          ) : undefined
        }
      >
        Shop goal
      </SectionTitle>
      <Card>
        {editingGoal ? (
          <View>
            <GoalDial
              value={draftGoal}
              min={0}
              max={5000000}
              step={50000}
              format={(v) => money(v)}
              caption="per week, whole shop"
              onChange={setDraftGoal}
            />
            <View style={{ height: 10 }} />
            <Button label="Save shop goal" onPress={saveGoal} />
            <View style={{ height: 8 }} />
            <Button label="Cancel" tone="ghost" onPress={() => setEditingGoal(false)} />
          </View>
        ) : (
          <>
            <MoneyChart
              series={cumulativeSeries(money2.sales, range)}
              startLabel={RANGE_LABEL[range].replace("This ", "")}
              endLabel="today"
              startISO={startOf(range)}
              goalCents={goalCents > 0 ? goalCents : undefined}
              rangeDays={daysInRange(range)}
              width={CHART_W}
            />
            {goalCents > 0 ? (
              <>
                <View style={styles.goalRow}>
                  <Text style={styles.goalNow}>{money(e.total)}</Text>
                  <Text style={styles.goalTarget}>of {money(goalCents)}</Text>
                </View>
                <ProgressBar pct={goalPct} tone={theme.good} />
                <Text style={styles.goalNote}>
                  {goalPct >= 1 ? "Goal hit, the whole room did that." : `${Math.round(goalPct * 100)}% there`}
                </Text>
              </>
            ) : range === "year" && weeklyGoal > 0 ? null : (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.goalPitch}>
                  Give the shop a number to chase and this chart races the whole room against it.
                </Text>
                <Button
                  label="Set the shop goal"
                  onPress={() => {
                    setDraftGoal(weeklyGoal || 500000);
                    setEditingGoal(true);
                  }}
                />
              </View>
            )}
          </>
        )}
      </Card>

      {chairsBlock}

      {/* 7-day strip, whole shop. */}
      <SectionTitle>Last 7 days</SectionTitle>
      <Card>
        <WeekBars bars={bars} />
      </Card>

      {/* The shop coach — same voice as the artist coach, reading every chair.
          Swipe a tip away; the next-ranked one fills the slot. */}
      {tips.length > 0 && (
        <>
          <SectionTitle>Coach</SectionTitle>
          <CoachDeck tips={tips} max={4} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { color: theme.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, marginTop: 8 },
  greetSub: { color: theme.textFaint, fontSize: 14, marginTop: 4, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "700",
    marginTop: 26,
    marginBottom: 10,
  },
  allClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.goodSoft,
    borderColor: "rgba(52,211,153,0.3)",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  allClearText: { color: theme.good, fontSize: 14.5, fontWeight: "600", flex: 1 },
  attnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  attnRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  attnText: { color: theme.text, fontSize: 14.5, lineHeight: 20 },
  attnDetail: { color: theme.textFaint, fontSize: 12.5, marginTop: 2 },
  rangeToggle: { marginBottom: 16 },
  editLink: { color: theme.text, fontSize: 13, fontWeight: "700" },
  goalRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 12, marginBottom: 10 },
  goalNow: { color: theme.text, fontSize: 24, fontWeight: "800" },
  goalTarget: { color: theme.textDim, fontSize: 14 },
  goalNote: { color: theme.textFaint, fontSize: 12, marginTop: 8 },
  goalPitch: { color: theme.textDim, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  chairRow: { paddingVertical: 10 },
  chairDivider: { borderTopColor: theme.border, borderTopWidth: 1 },
  chairTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 },
  chairName: { color: theme.text, fontSize: 14.5, fontWeight: "700" },
  chairMoney: { color: theme.text, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  chairTickets: { color: theme.textFaint, fontSize: 12, fontWeight: "400" },
  chairTrack: { height: 8, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  chairFill: { height: 8, borderRadius: 5, backgroundColor: theme.good },
  chairEmpty: { color: theme.textFaint, fontSize: 13.5 },
  chairHint: { color: theme.textFaint, fontSize: 11.5, marginTop: 12 },
  coachTitle: { color: theme.text, fontSize: 15.5, fontWeight: "700", marginBottom: 6 },
  coachBody: { color: theme.textDim, fontSize: 13.5, lineHeight: 19 },
});
