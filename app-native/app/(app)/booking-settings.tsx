import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "@/lib/appApi";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { tap, success } from "@/lib/haptics";
import { Button, Card, SectionTitle } from "@/components/ui";
import InkWash from "@/components/InkWash";

// Open times: the artist's self-serve booking setup. A switch, the week's
// hours on the shop clock, how long a session runs, the deposit that holds a
// time. Same contract as the web My Page card (/api/artist/booking-settings).

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];
type Hours = Partial<Record<DayKey, [string, string][]>>;
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 .. 23:00
const SESSIONS = [60, 90, 120, 180, 240, 360];
const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;
const clock = (v: string) => {
  const h = Number(v.slice(0, 2));
  return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
};
const sessionLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} hr${m === 60 ? "" : "s"}`);

type Settings = { selfServe: boolean; hours: Hours; sessionMinutes: number; depositCents: number; booksClosed: boolean };

export default function BookingSettings() {
  const insets = useSafeAreaInsets();
  const { artist: artistParam } = useLocalSearchParams<{ artist?: string }>();
  const { preview } = usePreview();
  const artistId = (typeof artistParam === "string" && artistParam) || preview?.artistId || null;
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const r = await apiGet<Settings & { ok: boolean }>(`/api/artist/booking-settings${artistId ? `?artist=${encodeURIComponent(artistId)}` : ""}`);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not load your booking setup.");
      return;
    }
    setS({ selfServe: r.data.selfServe, hours: r.data.hours, sessionMinutes: r.data.sessionMinutes, depositCents: r.data.depositCents, booksClosed: r.data.booksClosed });
    setDeposit(r.data.depositCents ? String(r.data.depositCents / 100) : "");
  }, [artistId]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<Settings>) => {
    if (!s) return;
    setBusy(true);
    setErr(null);
    const r = await apiPost<Settings & { ok: boolean }>("/api/artist/booking-settings", { ...(artistId ? { artistId } : {}), ...patch });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not save.");
      return;
    }
    success();
    setS({ ...s, selfServe: r.data.selfServe, hours: r.data.hours, sessionMinutes: r.data.sessionMinutes, depositCents: r.data.depositCents });
    setDirty(false);
  };

  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <Stack.Screen options={{ headerShown: true, title: "Open times", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
        {err ? <Text style={styles.err}>{err}</Text> : <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const hasHours = DAYS.some((d) => (s.hours[d.key] ?? []).length > 0);
  const setDayOn = (k: DayKey, on: boolean) => {
    const next: Hours = { ...s.hours, [k]: on ? [["11:00", "19:00"]] : [] };
    setS({ ...s, hours: next });
    setDirty(true);
  };
  const setWindow = (k: DayKey, which: 0 | 1, v: string) => {
    const cur = s.hours[k]?.[0] ?? ["11:00", "19:00"];
    const win: [string, string] = which === 0 ? [v, cur[1]] : [cur[0], v];
    setS({ ...s, hours: { ...s.hours, [k]: [win] } });
    setDirty(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Stack.Screen options={{ headerShown: true, title: "Open times", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.title}>Clients can book open times</Text>
              <Text style={styles.sub}>
                {s.selfServe
                  ? hasHours
                    ? "Your page shows your open times. A client picks one, pays the deposit, and it lands on your book."
                    : "Set your hours below and your page starts showing open times."
                  : "Off: clients send a request and you book it by hand."}
              </Text>
            </View>
            <Switch value={s.selfServe} onValueChange={(v) => save({ selfServe: v })} disabled={busy} trackColor={{ true: theme.brand, false: "rgba(255,255,255,0.15)" }} />
          </View>
          {s.booksClosed && <Text style={styles.warn}>Your books are closed right now, so nothing shows until you reopen them.</Text>}
        </Card>

        <SectionTitle>Hours</SectionTitle>
        <Card>
          {DAYS.map((d, i) => {
            const on = (s.hours[d.key] ?? []).length > 0;
            const win = s.hours[d.key]?.[0] ?? ["11:00", "19:00"];
            return (
              <View key={d.key} style={[styles.dayRow, i > 0 && styles.divider]}>
                <View style={styles.dayHead}>
                  <Text style={[styles.dayLabel, !on && { color: theme.textFaint }]}>{d.label}</Text>
                  <Text style={styles.dayWindow}>{on ? `${clock(win[0])} to ${clock(win[1])}` : "off"}</Text>
                  <Switch value={on} onValueChange={(v) => setDayOn(d.key, v)} trackColor={{ true: theme.brand, false: "rgba(255,255,255,0.15)" }} />
                </View>
                {on && (
                  <View style={{ marginTop: 8, gap: 6 }}>
                    <HourPicker label="From" value={win[0]} onPick={(v) => setWindow(d.key, 0, v)} />
                    <HourPicker label="To" value={win[1]} onPick={(v) => setWindow(d.key, 1, v)} min={Number(win[0].slice(0, 2)) + 1} />
                  </View>
                )}
              </View>
            );
          })}
        </Card>

        <SectionTitle>Session length</SectionTitle>
        <Card>
          <View style={styles.chips}>
            {SESSIONS.map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  tap();
                  setS({ ...s, sessionMinutes: m });
                  setDirty(true);
                }}
                style={[styles.chip, s.sessionMinutes === m && styles.chipOn]}
              >
                <Text style={[styles.chipText, s.sessionMinutes === m && styles.chipTextOn]}>{sessionLabel(m)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>Open times are offered one session apart.</Text>
        </Card>

        <SectionTitle>Deposit to book</SectionTitle>
        <Card>
          <View style={styles.depositRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput
              style={styles.input}
              value={deposit}
              onChangeText={(v) => {
                setDeposit(v);
                setDirty(true);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.textFaint}
            />
          </View>
          <Text style={styles.hint}>$0 books without a deposit. A paid deposit holds the time; no-shows forfeit it.</Text>
        </Card>

        {err && <Text style={styles.err}>{err}</Text>}
        <View style={{ height: 16 }} />
        <Button
          label={busy ? "Saving…" : dirty ? "Save" : "Saved"}
          disabled={busy || !dirty}
          onPress={() => save({ hours: s.hours, sessionMinutes: s.sessionMinutes, depositCents: Math.round((Number(deposit) || 0) * 100) })}
        />
      </ScrollView>
    </View>
  );
}

function HourPicker({ label, value, onPick, min = 0 }: { label: string; value: string; onPick: (v: string) => void; min?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={styles.pickLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {HOURS.filter((h) => h >= min).map((h) => {
          const v = hhmm(h);
          const on = v === value;
          return (
            <Pressable
              key={h}
              onPress={() => {
                tap();
                onPick(v);
              }}
              style={[styles.hourChip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{clock(v)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: theme.text, fontSize: 15.5, fontWeight: "700" },
  sub: { color: theme.textDim, fontSize: 13, lineHeight: 18, marginTop: 3 },
  warn: { color: theme.warn, fontSize: 12.5, marginTop: 10 },
  dayRow: { paddingVertical: 10 },
  divider: { borderTopColor: theme.border, borderTopWidth: 1 },
  dayHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  dayLabel: { color: theme.text, fontSize: 15, fontWeight: "700", width: 44 },
  dayWindow: { color: theme.textDim, fontSize: 13.5, flex: 1 },
  pickLabel: { color: theme.textFaint, fontSize: 12, width: 40 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderColor: theme.border, borderWidth: 1 },
  hourChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderColor: theme.border, borderWidth: 1 },
  chipOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  chipText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: theme.text },
  hint: { color: theme.textFaint, fontSize: 12, marginTop: 10, lineHeight: 17 },
  depositRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dollar: { color: theme.textDim, fontSize: 18 },
  input: { color: theme.text, fontSize: 18, fontWeight: "700", borderBottomColor: theme.borderStrong, borderBottomWidth: 1, minWidth: 90, paddingVertical: 6 },
  err: { color: theme.bad, fontSize: 13, marginTop: 12, textAlign: "center" },
});
