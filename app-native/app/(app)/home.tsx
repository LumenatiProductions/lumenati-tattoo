import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { tap } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme, money } from "@/lib/theme";
import { Button, Card, ProgressBar, SectionTitle, Stat } from "@/components/ui";
import InkWash from "@/components/InkWash";
import ArtistMoney from "@/components/ArtistMoney";
import ArtistSetup from "@/components/ArtistSetup";
import TabToggle from "@/components/TabToggle";
import Launcher from "@/components/Launcher";
import MoneyChart from "@/components/MoneyChart";
import WeekBars from "@/components/WeekBars";
import GoalDial from "@/components/GoalDial";
import { LumenatiLogo } from "@/components/LumenatiLogo";
import CoachDeck from "@/components/CoachDeck";
import { cumulativeSeries, daysInRange, earnedInRange, last7Days, startOf, type Range } from "@/lib/personal";
import { loadShopMoney, shopCoachTips, type ShopMoney } from "@/lib/shop-coach";
import { apiDelete } from "@/lib/appApi";

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Local YYYY-MM-DD for N days ago — same anchoring as the web's daysAgoLocal so
// the week window matches the Monday email.
const daysAgoLocal = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Two roles: Admin runs the shop, Artist runs their chair.
const ROLE_LABEL: Record<string, string> = {
  owner: "Admin",
  artist: "Artist",
};

// Role-routed home: artists get the money + coaching dashboard (6b), staff get
// the shop glance (the owner cockpit port lands in 6d).
export default function Home() {
  const { role, email, fullName, signOut, shopId } = useAuth();
  const insets = useSafeAreaInsets();
  const isStaff = role === "owner";
  // Greet like a person: profile name first, email prefix as the fallback.
  const firstName = (fullName ?? "").trim().split(/\s+/)[0] || (email ?? "").split("@")[0];
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Owner-only: see the app the way an artist does — global, every screen
  // scopes to the previewed artist until Exit.
  const { preview, setPreview } = usePreview();
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  // Staff who ALSO hold a chair (JD: co-owner + artist) get two homes in tabs.
  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<"shop" | "money">("shop");

  useEffect(() => {
    if (role === "owner" && shopId) {
      supabase.from("artists").select("id, name").eq("shop_id", shopId).eq("active", true).order("sort")
        .then(({ data }) => setRoster((data ?? []) as { id: string; name: string }[]));
    }
    if (isStaff && email) {
      supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle()
        .then(({ data }) => setMyArtistId((data?.artist_id as string | null) ?? null));
    }
  }, [role, isStaff, email, shopId]);

  const previewArtist = preview;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
    {/* Fixed ink atmosphere; the glass panels scroll over it. */}
    <InkWash />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
    >
      <View style={styles.header}>
        <LumenatiLogo width={72} />
        <Pressable onPress={signOut} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Ionicons name="log-out-outline" size={20} color={theme.textDim} />
        </Pressable>
      </View>

      {/* Who the app thinks you are — quiet eyebrow, not a pill in the header */}
      <Text style={styles.roleEyebrow}>
        {previewArtist ? "Artist · preview" : role ? ROLE_LABEL[role] ?? role : ""}
      </Text>

      {previewArtist ? (
        <>
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerText}>Viewing as {previewArtist.name}</Text>
            <Pressable onPress={() => setPreview(null)} hitSlop={8}>
              <Text style={styles.previewExit}>Exit</Text>
            </Pressable>
          </View>
          <ArtistMoney firstName={firstName} artistId={previewArtist.artistId} previewName={previewArtist.name} reloadKey={reloadKey} />
          <Launcher role="artist" />
        </>
      ) : isStaff ? (
        <>
          {myArtistId && (
            <View style={styles.homeTabs}>
              {(["shop", "money"] as const).map((t) => (
                <Pressable key={t} onPress={() => setHomeTab(t)} style={[styles.homeTab, homeTab === t && styles.homeTabOn]}>
                  <Text style={[styles.homeTabText, homeTab === t && styles.homeTabTextOn]}>
                    {t === "shop" ? "Shop" : "My money"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {myArtistId && homeTab === "money" ? (
            <ArtistMoney firstName={firstName} artistId={myArtistId} reloadKey={reloadKey} />
          ) : (
            <StaffHome firstName={firstName} role={role} reloadKey={reloadKey} />
          )}
        </>
      ) : (
        <>
          <ArtistSetup reloadKey={reloadKey} />
          <ArtistMoney firstName={firstName} reloadKey={reloadKey} />
        </>
      )}

      {!previewArtist && <Launcher role={role} />}

      {role === "owner" && !previewArtist && roster.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <Text style={styles.sectionLabel}>View as artist</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {roster.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setPreview({ artistId: a.id, name: a.name })}
                style={({ pressed }) => [styles.previewChip, pressed && { borderColor: theme.borderStrong }]}
              >
                <Text style={styles.previewChipText}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!previewArtist && <DeleteAccount signOut={signOut} />}
    </ScrollView>
    </View>
  );
}

// App Store 5.1.1(v): accounts must be deletable from inside the app. Quiet
// footer action; double-confirmed; the server refuses a shop's only admin.
function DeleteAccount({ signOut }: { signOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = () =>
    Alert.alert(
      "Delete your account?",
      "This removes your login and personal data from Lumenati. Shop records like bookings and sales stay with the shop. This can't be undone.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const r = await apiDelete("/api/account");
            setBusy(false);
            if (!r.ok) {
              Alert.alert("Couldn't delete your account", r.error ?? "Try again in a minute.");
              return;
            }
            signOut();
          },
        },
      ],
    );
  return (
    <Pressable onPress={confirm} disabled={busy} hitSlop={10} style={{ marginTop: 40, alignSelf: "center", opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: theme.textDim, fontSize: 13, textDecorationLine: "underline" }}>
        {busy ? "Deleting your account…" : "Delete my account"}
      </Text>
    </Pressable>
  );
}

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

// The owner's cockpit, brought up to the artist page's standard (Scott,
// 2026-07-11): the revenue race chart with a shop goal to chase, the 7-day
// strip, every chair's numbers side by side, and a SHOP coach reading the
// whole room — with the ops glance (attention list) still at the bottom.
function StaffHome({ firstName, role, reloadKey }: { firstName: string; role: string | null; reloadKey: number }) {
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

  useEffect(() => {
    if (!shopId) return;
    (async () => {
      const date = todayLocal();
      const nowIso = new Date().toISOString();
      const [shopMoney, apptRes, invRes, fuRes, heldRes, compRes, artistsRes, shopRes, rentRes, waitRes] =
        await Promise.all([
          loadShopMoney(),
          supabase
            .from("bookings")
            .select("checked_in_at")
            .gte("starts_at", date)
            .lte("starts_at", `${date}T23:59:59.999`)
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
      const appts = (apptRes.data ?? []) as { checked_in_at: string | null }[];
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
        checkedIn: appts.filter((b) => b.checked_in_at).length,
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
    const from = startOf(range);
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
  }, [money2, artists, range]);

  if (!stats || !money2) {
    return (
      <View>
        <Text style={styles.greeting}>Hey {firstName}</Text>
        <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const e = earnedInRange(money2.sales, range);
  const from = startOf(range);
  const inRange = money2.sales.filter((s) => (s.created_at || "").slice(0, 10) >= from);
  const card = inRange.filter((s) => s.method !== "cash").reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
  const cash = inRange.filter((s) => s.method === "cash").reduce((a, s) => a + (s.service_cents ?? 0) + (s.tip_cents ?? 0), 0);
  const bars = last7Days(money2.sales);

  const weeklyGoal = shopRow?.goal_weekly_cents ?? 0;
  const goalCents =
    range === "week" ? weeklyGoal : range === "month" ? Math.round((weeklyGoal * 52) / 12) : 0;
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
    attention.push({ icon: "calendar-outline", sev: "low", text: `${stats.apptsToday} appointment${stats.apptsToday === 1 ? "" : "s"} today`, detail: `${stats.checkedIn} checked in`, href: "/bookings" });
  if (stats.depositsHeld)
    attention.push({ icon: "card-outline", sev: "low", text: `${money(stats.depositsHeld)} in deposits held`, href: "/bookings" });

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

      {/* Range toggle — same mechanic as the artist page. */}
      <View style={[styles.rangeToggle, { marginTop: 22 }]}>
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
        <Stat
          label="Today"
          value={`${stats.checkedIn}/${stats.apptsToday}`}
          sub="checked in"
          onPress={() => router.push("/bookings")}
        />
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

      {/* Every chair, side by side. Tap one to see the shop through their eyes. */}
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roleEyebrow: {
    color: theme.textFaint,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    fontWeight: "700",
    marginTop: 24,
  },
  greeting: { color: theme.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, marginTop: 8 },
  greetSub: { color: theme.textFaint, fontSize: 14, marginTop: 4, marginBottom: 18 },
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
  previewBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.surfaceRaised,
    borderColor: theme.border,
    borderTopColor: theme.glassEdge,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  previewBannerText: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
  previewExit: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
  previewChip: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  previewChipText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  homeTabs: { flexDirection: "row", gap: 8, marginTop: 18 },
  homeTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderColor: theme.border, borderWidth: 1 },
  // Tab selection is a lift, not a pink fill — pink is money-only now.
  homeTabOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  homeTabText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  homeTabTextOn: { color: "#fff" },
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
  coachLink: { color: theme.text, fontSize: 13, fontWeight: "700" },
});
