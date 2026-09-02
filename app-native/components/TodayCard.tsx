import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { tap } from "@/lib/haptics";
import { Card, SectionTitle } from "@/components/ui";
import { loadToday, type TodayBooking } from "@/lib/personal";

// "Your day" — the next client, ready before the phone is back in the pocket.
// The next upcoming booking gets the hero treatment (who, when, how soon);
// the rest of today collapses into quiet rows underneath.

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// "in 45 min" / "in 3 hr" / "now" — the glanceable part.
function untilLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem >= 15 ? `in ${hr} hr ${rem} min` : `in ${hr} hr`;
}

export default function TodayCard({ artistId, reloadKey = 0 }: { artistId?: string; reloadKey?: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<TodayBooking[] | null>(null);

  useEffect(() => {
    loadToday(artistId).then(setRows);
    // Tick every minute so "in 45 min" stays honest while the screen is up.
    const t = setInterval(() => loadToday(artistId).then(setRows), 60000);
    return () => clearInterval(t);
  }, [artistId, reloadKey]);

  if (!rows) return null;

  // Three states for a scheduled session, by the clock (lum-035): still
  // ahead, in the chair right now (start passed, end hasn't), or past its end
  // and never closed out. Only "completed" counts as done; the copy never says
  // the day is over while a row is still open.
  const now = Date.now();
  const endOf = (b: TodayBooking) => (b.ends_at ? Date.parse(b.ends_at) : Date.parse(b.starts_at) + 60 * 60000);
  const scheduled = rows.filter((b) => b.status === "scheduled");
  const live = scheduled.filter((b) => Date.parse(b.starts_at) <= now && endOf(b) > now);
  const upcoming = scheduled.filter((b) => Date.parse(b.starts_at) > now);
  const open = scheduled.filter((b) => endOf(b) <= now);
  const next = live[0] ?? upcoming[0];
  const rest = rows.filter((b) => b.id !== next?.id);
  const done = rows.filter((b) => b.status === "completed").length;
  const stillOpen = open[0];

  return (
    <View style={{ marginBottom: 4 }}>
      <SectionTitle>Your day</SectionTitle>
      {rows.length === 0 ? (
        <Card>
          <View style={styles.emptyRow}>
            <Ionicons name="sunny-outline" size={18} color={theme.textFaint} />
            <Text style={styles.emptyText}>Nothing on the book today. Open chair, fill it or enjoy it.</Text>
          </View>
        </Card>
      ) : (
        <Card style={next ? { borderColor: theme.borderStrong } : undefined}>
          {next ? (
            <Pressable
              onPress={() => {
                tap();
                router.push("/bookings");
              }}
              style={({ pressed }) => [styles.hero, pressed && { opacity: 0.75 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.heroWhen}>
                  {live.includes(next) ? "In the chair now" : untilLabel(next.starts_at)} · {fmtTime(next.starts_at)}
                </Text>
                <Text style={styles.heroName}>{next.clientName}</Text>
                {next.service_desc ? <Text style={styles.heroDesc}>{next.service_desc}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textFaint} />
            </Pressable>
          ) : stillOpen ? (
            <Pressable
              onPress={() => {
                tap();
                router.push("/bookings");
              }}
              style={({ pressed }) => [styles.emptyRow, pressed && { opacity: 0.75 }]}
            >
              <Ionicons name="alert-circle-outline" size={18} color={theme.warn} />
              <Text style={styles.emptyText}>
                {stillOpen.clientName} at {fmtTime(stillOpen.starts_at)} is still open. Mark it done or a no-show.
                {open.length > 1 ? ` ${open.length - 1} more like it.` : ""}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
            </Pressable>
          ) : (
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={theme.good} />
              <Text style={styles.emptyText}>
                That&apos;s the day{done ? `, ${done} client${done === 1 ? "" : "s"} done` : ""}. Nothing else booked.
              </Text>
            </View>
          )}

          {rest.length > 0 && (
            <View style={next ? styles.restWrap : undefined}>
              {rest.map((b) => (
                <View key={b.id} style={styles.row}>
                  <Text style={styles.rowTime}>{fmtTime(b.starts_at)}</Text>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {b.clientName}
                    {b.service_desc ? <Text style={styles.rowDesc}> · {b.service_desc}</Text> : null}
                  </Text>
                  {b.status === "completed" && <Ionicons name="checkmark" size={14} color={theme.good} />}
                  {open.includes(b) && <Text style={styles.openTag}>open</Text>}
                </View>
              ))}
            </View>
          )}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroWhen: { color: theme.text, fontSize: 12.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  heroName: { color: theme.text, fontSize: 22, fontWeight: "800", marginTop: 3 },
  heroDesc: { color: theme.textDim, fontSize: 13.5, marginTop: 2 },
  restWrap: { borderTopColor: theme.border, borderTopWidth: 1, marginTop: 12, paddingTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  rowTime: { color: theme.textFaint, fontSize: 13, width: 66, fontVariant: ["tabular-nums"] },
  rowName: { color: theme.textDim, fontSize: 14, flex: 1, fontWeight: "600" },
  rowDesc: { color: theme.textFaint, fontWeight: "400" },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyText: { color: theme.textDim, fontSize: 13.5, flex: 1, lineHeight: 19 },
  openTag: { color: theme.warn, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
});
