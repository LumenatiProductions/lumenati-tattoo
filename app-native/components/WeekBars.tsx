import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme, money } from "@/lib/theme";
import { tap } from "@/lib/haptics";

// The 7-day bar strip, tappable: the biggest day starts labeled; tapping any
// bar moves the value bubble to it. Zero days show no bubble, and a fully
// quiet week says so in words. Shared by the artist and shop homes.
export default function WeekBars({ bars }: { bars: { label: string; cents: number }[] }) {
  const maxBar = Math.max(1, ...bars.map((b) => b.cents));
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

const styles = StyleSheet.create({
  quietWeek: { color: theme.textFaint, fontSize: 12.5, marginBottom: 10 },
  bars: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 110 },
  barCol: { flex: 1, alignItems: "center" },
  barTrack: { height: 90, width: 14, justifyContent: "flex-end", borderRadius: 7, overflow: "hidden" },
  bar: { width: 14, borderRadius: 7, minHeight: 3 },
  barLabel: { color: theme.textFaint, fontSize: 11, marginTop: 6 },
  barValue: { color: theme.text, fontSize: 11, fontWeight: "700", marginBottom: 5, fontVariant: ["tabular-nums"] },
});
