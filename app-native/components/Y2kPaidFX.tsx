import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, Vibration, View } from "react-native";
import { money } from "@/lib/theme";

// The payment-success blast: the one full-Y2K moment in the clean app, earned
// by money changing hands. White flash, pixel confetti in the neon palette,
// giant glowing PAID + amount, "TRANSACTION COMPLETE" ticker text, and a
// cha-ching vibration. Pure RN Animated — no deps, no sound files.

const PALETTE = ["#FF1493", "#00ffff", "#7fff00", "#FFD700", "#B026FF", "#ffffff"];
const { width: W, height: H } = Dimensions.get("window");
const CONFETTI = 26;

export default function Y2kPaidFX({ cents, onDone }: { cents: number; onDone: () => void }) {
  const flash = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.2)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const pieces = useRef(
    Array.from({ length: CONFETTI }, (_, i) => ({
      x: Math.random() * W,
      delay: Math.random() * 350,
      size: 6 + Math.random() * 10,
      color: PALETTE[i % PALETTE.length],
      fall: new Animated.Value(-40 - Math.random() * 120),
      spin: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    Vibration.vibrate([0, 60, 60, 140]); // cha-ching
    Animated.timing(flash, { toValue: 0, duration: 420, useNativeDriver: true }).start();
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 280, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]),
    ).start();
    for (const p of pieces) {
      Animated.timing(p.fall, {
        toValue: H + 60,
        duration: 1700 + Math.random() * 900,
        delay: p.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
      Animated.loop(
        Animated.timing(p.spin, { toValue: 1, duration: 500 + Math.random() * 500, useNativeDriver: true }),
      ).start();
    }
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(5,5,8,0.92)" }]} />
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: [
              { translateY: p.fall },
              { rotate: p.spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
            ],
          }}
        />
      ))}
      <Animated.View style={[styles.center, { opacity: fade, transform: [{ scale }] }]}>
        <Text style={styles.eyebrow}>✦ TRANSACTION COMPLETE ✦</Text>
        <Text style={styles.paid}>PAID</Text>
        <Text style={styles.amount}>{money(cents)}</Text>
        <Animated.Text style={[styles.footer, { opacity: blink }]}>▸ STAY GOLD ◂</Animated.Text>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flash }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  eyebrow: {
    color: "#00ffff",
    fontSize: 13,
    letterSpacing: 4,
    fontWeight: "700",
    textShadowColor: "rgba(0,255,255,0.9)",
    textShadowRadius: 12,
    marginBottom: 14,
  },
  paid: {
    color: "#FF1493",
    fontSize: 84,
    fontWeight: "900",
    letterSpacing: 6,
    textShadowColor: "rgba(255,20,147,0.95)",
    textShadowRadius: 24,
  },
  amount: {
    color: "#7fff00",
    fontSize: 44,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(127,255,0,0.9)",
    textShadowRadius: 16,
    marginTop: 6,
  },
  footer: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    letterSpacing: 5,
    fontWeight: "700",
    marginTop: 26,
  },
});
