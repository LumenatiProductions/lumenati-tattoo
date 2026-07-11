import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { tap } from "@/lib/haptics";
import { Card, SectionTitle } from "@/components/ui";

// The artist's book as a real calendar on their home (bug 5dd127d9): cycle
// Next up / Day / Week / Month. Week and month are tappable grids — pick a day
// and its appointments list right below. Reads under RLS (an artist sees only
// their own book); `artistId` scopes explicitly for owner preview.

type Row = {
  id: string;
  starts_at: string;
  status: string;
  service_desc: string;
  client_id: string | null;
};

type ViewMode = "next" | "day" | "week" | "month";
const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "next", label: "Next up" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayTitle = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export default function BookingCalendar({ artistId, reloadKey = 0 }: { artistId?: string; reloadKey?: number }) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("next");
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  // The month being looked at (first of month) and the picked day.
  const [anchor, setAnchor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selDay, setSelDay] = useState(() => keyOf(new Date()));

  const load = useCallback(async () => {
    // A generous window: last month through two months out covers every view.
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    from.setDate(1);
    const to = new Date();
    to.setMonth(to.getMonth() + 3);
    to.setDate(1);
    let q = supabase
      .from("bookings")
      .select("id, starts_at, status, service_desc, client_id")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(400);
    if (artistId) q = q.eq("artist_id", artistId);
    const { data } = await q;
    const list = (data ?? []) as Row[];
    setRows(list);
    const ids = [...new Set(list.map((b) => b.client_id).filter(Boolean) as string[])];
    if (ids.length) {
      const { data: cs } = await supabase.from("clients").select("id, first_name, last_name").in("id", ids);
      setNames(
        new Map(
          ((cs ?? []) as { id: string; first_name: string; last_name: string }[]).map((c) => [
            c.id,
            `${c.first_name} ${c.last_name}`.trim() || "Client",
          ]),
        ),
      );
    }
  }, [artistId]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const b of rows) {
      const k = keyOf(new Date(b.starts_at));
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return m;
  }, [rows]);

  const clientName = (id: string | null) => (id ? names.get(id) ?? "Client" : "Walk-in");

  const List = ({ items, empty }: { items: Row[]; empty: string }) =>
    items.length === 0 ? (
      <Text style={styles.empty}>{empty}</Text>
    ) : (
      <View>
        {items.map((b, i) => (
          <Pressable
            key={b.id}
            onPress={() => {
              tap();
              router.push("/bookings");
            }}
            style={({ pressed }) => [styles.apptRow, i > 0 && styles.apptDivider, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.apptTime}>{clock(b.starts_at)}</Text>
            <Text style={styles.apptName} numberOfLines={1}>
              {clientName(b.client_id)}
              {b.service_desc ? <Text style={styles.apptDesc}> · {b.service_desc}</Text> : null}
            </Text>
            {b.status === "completed" && <Ionicons name="checkmark" size={14} color={theme.good} />}
          </Pressable>
        ))}
      </View>
    );

  // ── Next up: the handful coming at you, dated ──
  const nextUp = rows
    .filter((b) => b.status === "scheduled" && new Date(b.starts_at).getTime() > Date.now() - 15 * 60000)
    .slice(0, 6);

  // ── Week strip: this week Sun..Sat around selDay ──
  const weekDays = useMemo(() => {
    const d = new Date(`${selDay}T00:00:00`);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      return keyOf(x);
    });
  }, [selDay]);

  const shiftWeek = (dir: -1 | 1) => {
    const d = new Date(`${selDay}T00:00:00`);
    d.setDate(d.getDate() + dir * 7);
    setSelDay(keyOf(d));
  };

  // ── Month grid: leading blanks + days ──
  const monthCells = useMemo(() => {
    const first = new Date(anchor);
    const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
    const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= days; i++) cells.push(keyOf(new Date(anchor.getFullYear(), anchor.getMonth(), i)));
    return cells;
  }, [anchor]);

  const shiftMonth = (dir: -1 | 1) =>
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));

  const todayKey = keyOf(new Date());
  const selList = byDay.get(selDay) ?? [];

  return (
    <View style={{ marginBottom: 4 }}>
      <SectionTitle>Calendar</SectionTitle>
      <Card>
        <View style={styles.tabs}>
          {VIEWS.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => {
                tap();
                setView(v.id);
              }}
              style={[styles.tab, view === v.id && styles.tabOn]}
            >
              <Text style={[styles.tabText, view === v.id && { color: "#fff" }]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>

        {view === "next" && (
          <View>
            {nextUp.length === 0 ? (
              <Text style={styles.empty}>Nothing coming up — the chair is open.</Text>
            ) : (
              nextUp.map((b, i) => (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    tap();
                    router.push("/bookings");
                  }}
                  style={({ pressed }) => [styles.apptRow, i > 0 && styles.apptDivider, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ width: 76 }}>
                    <Text style={styles.apptDay}>
                      {new Date(b.starts_at).toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                    </Text>
                    <Text style={styles.apptTime}>{clock(b.starts_at)}</Text>
                  </View>
                  <Text style={styles.apptName} numberOfLines={1}>
                    {clientName(b.client_id)}
                    {b.service_desc ? <Text style={styles.apptDesc}> · {b.service_desc}</Text> : null}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        {view === "day" && (
          <View>
            <Text style={styles.gridTitle}>{dayTitle(todayKey)}</Text>
            <List items={byDay.get(todayKey) ?? []} empty="Nothing on the book today." />
          </View>
        )}

        {view === "week" && (
          <View>
            <View style={styles.gridHead}>
              <Pressable onPress={() => shiftWeek(-1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={17} color={theme.textDim} />
              </Pressable>
              <Text style={styles.gridTitle}>
                Week of {new Date(`${weekDays[0]}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
              <Pressable onPress={() => shiftWeek(1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={17} color={theme.textDim} />
              </Pressable>
            </View>
            <View style={styles.weekRow}>
              {weekDays.map((k, i) => {
                const count = (byDay.get(k) ?? []).length;
                const on = k === selDay;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      tap();
                      setSelDay(k);
                    }}
                    style={[styles.weekCell, on && styles.cellOn, k === todayKey && !on && styles.cellToday]}
                  >
                    <Text style={styles.cellDow}>{DOW[i]}</Text>
                    <Text style={[styles.cellNum, on && { color: "#fff" }]}>{Number(k.slice(8, 10))}</Text>
                    <View style={styles.dotRow}>
                      {Array.from({ length: Math.min(count, 3) }, (_, d) => (
                        <View key={d} style={styles.dot} />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.gridTitle}>{dayTitle(selDay)}</Text>
            <List items={selList} empty="Nothing booked this day." />
          </View>
        )}

        {view === "month" && (
          <View>
            <View style={styles.gridHead}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={17} color={theme.textDim} />
              </Pressable>
              <Text style={styles.gridTitle}>
                {anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={17} color={theme.textDim} />
              </Pressable>
            </View>
            <View style={styles.dowRow}>
              {DOW.map((d, i) => (
                <Text key={i} style={styles.dowLabel}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.monthGrid}>
              {monthCells.map((k, i) =>
                k === null ? (
                  <View key={`b${i}`} style={styles.monthCell} />
                ) : (
                  <Pressable
                    key={k}
                    onPress={() => {
                      tap();
                      setSelDay(k);
                    }}
                    style={[styles.monthCell, k === selDay && styles.cellOn, k === todayKey && k !== selDay && styles.cellToday]}
                  >
                    <Text style={[styles.cellNum, k === selDay && { color: "#fff" }]}>{Number(k.slice(8, 10))}</Text>
                    {(byDay.get(k) ?? []).length > 0 && <View style={styles.dot} />}
                  </Pressable>
                ),
              )}
            </View>
            <Text style={styles.gridTitle}>{dayTitle(selDay)}</Text>
            <List items={selList} empty="Nothing booked this day." />
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" },
  tab: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, borderColor: theme.border, borderWidth: 1 },
  tabOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  tabText: { color: theme.textDim, fontSize: 12.5, fontWeight: "600" },
  empty: { color: theme.textFaint, fontSize: 13.5, lineHeight: 19, paddingVertical: 6 },
  apptRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  apptDivider: { borderTopColor: theme.border, borderTopWidth: 1 },
  apptDay: { color: theme.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" },
  apptTime: { color: theme.text, fontSize: 13.5, fontWeight: "700", width: 74, fontVariant: ["tabular-nums"] },
  apptName: { color: theme.textDim, fontSize: 14, flex: 1, fontWeight: "600" },
  apptDesc: { color: theme.textFaint, fontWeight: "400" },
  gridHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  gridTitle: { color: theme.text, fontSize: 13.5, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  weekRow: { flexDirection: "row", gap: 4, marginBottom: 12 },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  cellOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  cellToday: { borderColor: theme.borderStrong },
  cellDow: { color: theme.textFaint, fontSize: 10, fontWeight: "700", marginBottom: 3 },
  cellNum: { color: theme.textDim, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  dotRow: { flexDirection: "row", gap: 2, height: 5, marginTop: 3, alignItems: "center" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.brand },
  dowRow: { flexDirection: "row", marginBottom: 4 },
  dowLabel: { flex: 1, textAlign: "center", color: theme.textFaint, fontSize: 10, fontWeight: "700" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  monthCell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 2,
  },
});
