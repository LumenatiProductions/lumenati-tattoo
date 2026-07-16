import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { theme, money } from "@/lib/theme";
import { picked } from "@/lib/haptics";

// The 7-day bar strip: the biggest day starts labeled, and a finger slides
// across the week — each bar it crosses lights up with a selection tick and
// moves the value bubble, same glide as the money chart. A plain tap still
// picks a single bar. Zero days show no bubble; a fully quiet week says so.
export default function WeekBars({ bars }: { bars: { label: string; cents: number }[] }) {
  const maxBar = Math.max(1, ...bars.map((b) => b.cents));
  const biggest = bars.reduce((bi, b, i) => (b.cents > bars[bi].cents ? i : bi), 0);
  const [sel, setSel] = useState(biggest);
  const selRef = useRef(biggest);
  const widthRef = useRef(0);
  const quietWeek = bars.every((b) => !b.cents);

  const pick = (localX: number) =>
    Math.min(bars.length - 1, Math.max(0, Math.floor((localX / (widthRef.current || 1)) * bars.length)));
  const setBar = (i: number) => {
    if (i !== selRef.current) {
      selRef.current = i;
      setSel(i);
      picked();
    }
  };
  // Gesture-handler, not PanResponder: a sideways drag slides across the week, a
  // vertical drag scrolls the page, and a tap still picks a single bar. The old
  // PanResponder fought the ScrollView and the slide barely worked.
  const gesture = useMemo(() => {
    const drag = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .onStart((e) => setBar(pick(e.x)))
      .onUpdate((e) => setBar(pick(e.x)));
    const tap = Gesture.Tap().runOnJS(true).onEnd((e) => setBar(pick(e.x)));
    return Gesture.Race(drag, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars.length]);

  return (
    <View>
      {quietWeek && <Text style={styles.quietWeek}>Nothing rung up in the last 7 days yet.</Text>}
      <GestureDetector gesture={gesture}>
      <View style={styles.bars} onLayout={(e) => (widthRef.current = e.nativeEvent.layout.width)}>
        {bars.map((b, i) => (
          <View key={i} style={styles.barCol} pointerEvents="none">
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
          </View>
        ))}
      </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  quietWeek: { color: theme.textFaint, fontSize: 12.5, marginBottom: 10 },
  // paddingHorizontal keeps the first/last day's value bubble off the card edge.
  bars: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 110, paddingHorizontal: 8 },
  barCol: { flex: 1, alignItems: "center" },
  barTrack: { height: 90, width: 14, justifyContent: "flex-end", borderRadius: 7, overflow: "hidden" },
  bar: { width: 14, borderRadius: 7, minHeight: 3 },
  barLabel: { color: theme.textFaint, fontSize: 11, marginTop: 6 },
  barValue: { color: theme.text, fontSize: 11, fontWeight: "700", marginBottom: 5, fontVariant: ["tabular-nums"] },
});
