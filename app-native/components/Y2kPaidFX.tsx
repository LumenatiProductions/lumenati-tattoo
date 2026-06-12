import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFonts } from "expo-font";
import { PressStart2P_400Regular } from "@expo-google-fonts/press-start-2p";
import { VT323_400Regular } from "@expo-google-fonts/vt323";
import { money } from "@/lib/theme";
import { chaChing } from "@/lib/haptics";

// The payment-success blast: the one full-Y2K moment in the clean app, earned
// by money changing hands. CRT power-on flash, scanlines + a rolling sweep,
// neon shockwave rings, pixel-font PAID slamming in with a glitch jolt, the
// amount counting up in terminal type, two waves of center-burst confetti and
// a scrolling ticker. Tap anywhere to dismiss early. Pure RN Animated + two
// arcade fonts — no native deps.

const PALETTE = ["#FF1493", "#00ffff", "#7fff00", "#FFD700", "#B026FF", "#ffffff"];
const { width: W, height: H } = Dimensions.get("window");
const CONFETTI = 48; // two waves
const RINGS = 3;
const CX = W / 2;
const CY = H * 0.44;
const SCANLINES = Math.ceil(H / 14);
const SHOW_MS = 5600;

export default function Y2kPaidFX({ cents, onDone }: { cents: number; onDone: () => void }) {
  const [fontsLoaded] = useFonts({ PressStart2P_400Regular, VT323_400Regular });
  const flash = useRef(new Animated.Value(1)).current;
  const flicker = useRef(new Animated.Value(1)).current;
  const slam = useRef(new Animated.Value(0)).current; // 0 = above+huge, 1 = landed
  const glitch = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const ticker = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  const rings = useRef(
    Array.from({ length: RINGS }, (_, i) => ({
      v: new Animated.Value(0),
      color: PALETTE[i % PALETTE.length],
      delay: i * 130,
    })),
  ).current;

  // Confetti bursts outward from the slam point, then gravity wins. Second
  // half of the pieces launch as a late wave so the sky stays busy.
  const pieces = useRef(
    Array.from({ length: CONFETTI }, (_, i) => {
      const theta = Math.random() * Math.PI * 2;
      const dist = 110 + Math.random() * 260;
      return {
        dx: Math.cos(theta) * dist,
        peak: -(Math.abs(Math.sin(theta)) * dist * 0.9 + 40 + Math.random() * 60),
        size: 5 + Math.random() * 9,
        color: PALETTE[i % PALETTE.length],
        wave: i < CONFETTI / 2 ? 0 : 1500 + Math.random() * 400,
        x: new Animated.Value(0),
        y: new Animated.Value(0),
        spin: new Animated.Value(0),
        die: new Animated.Value(0),
      };
    }),
  ).current;

  useEffect(() => {
    // cha-CHING: success chime feel, then escalating thumps — the heavy one
    // lands with the PAID slam.
    chaChing();

    // Stage 1 (0ms): CRT power-on — white flash + a couple of frame flickers.
    Animated.timing(flash, { toValue: 0, duration: 360, useNativeDriver: true }).start();
    Animated.sequence(
      [0.55, 1, 0.7, 1].map((to) =>
        Animated.timing(flicker, { toValue: to, duration: 70, useNativeDriver: true }),
      ),
    ).start();
    for (const r of rings) {
      Animated.timing(r.v, {
        toValue: 1,
        duration: 720,
        delay: r.delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    // Stage 2 (~80ms): PAID slams down from above, overshoots, settles.
    Animated.sequence([
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(slam, {
          toValue: 1,
          duration: 420,
          easing: Easing.bezier(0.2, 1.4, 0.4, 1),
          useNativeDriver: true,
        }),
      ]),
      // Stage 3: glitch jolt right after landing.
      Animated.sequence(
        [9, -7, 4, -2, 0].map((to) =>
          Animated.timing(glitch, { toValue: to, duration: 45, useNativeDriver: true }),
        ),
      ),
    ]).start();

    // Stage 4: amount counts up while confetti flies.
    count.setValue(0);
    const sub = count.addListener(({ value }) => setShown(Math.round(value)));
    Animated.timing(count, {
      toValue: cents,
      duration: 850,
      delay: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    for (const p of pieces) {
      Animated.sequence([
        Animated.delay(p.wave),
        Animated.parallel([
          Animated.timing(p.die, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.timing(p.x, {
            toValue: p.dx,
            duration: 1500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(p.y, { toValue: p.peak, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(p.y, { toValue: H * 0.6, duration: 1400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(1400),
            Animated.timing(p.die, { toValue: 0, duration: 450, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
      Animated.loop(
        Animated.timing(p.spin, { toValue: 1, duration: 420 + Math.random() * 480, useNativeDriver: true }),
      ).start();
    }

    // Ticker marquee, CRT sweep, and blink run for the whole show.
    Animated.loop(
      Animated.timing(ticker, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 260, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
    ).start();

    const t = setTimeout(onDone, SHOW_MS);
    return () => {
      clearTimeout(t);
      count.removeListener(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const px = fontsLoaded ? { fontFamily: "PressStart2P_400Regular" } : null;
  const vt = fontsLoaded ? { fontFamily: "VT323_400Regular" } : null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onDone}>
    <Pressable style={StyleSheet.absoluteFill} onPress={onDone}>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: flicker }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(5,5,8,0.96)" }]} />

      {/* shockwave rings */}
      {rings.map((r, i) => (
        <Animated.View
          key={`ring${i}`}
          style={[
            styles.ring,
            {
              borderColor: r.color,
              shadowColor: r.color,
              opacity: r.v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: r.v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 3.1] }) }],
            },
          ]}
        />
      ))}

      {/* confetti burst */}
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: CX - p.size / 2,
            top: CY,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            opacity: p.die,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { rotate: p.spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
            ],
          }}
        />
      ))}

      <Animated.View
        style={[
          styles.center,
          {
            opacity: fade,
            transform: [
              { translateY: slam.interpolate({ inputRange: [0, 1], outputRange: [-H * 0.28, 0] }) },
              { scale: slam.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) },
              { translateX: glitch },
            ],
          },
        ]}
      >
        <Text style={[styles.eyebrow, px]}>TRANSACTION COMPLETE</Text>
        <Text style={[styles.paid, px]}>PAID</Text>
        <Text style={[styles.amount, vt]}>{money(shown)}</Text>
        <Animated.Text style={[styles.footer, px, { opacity: blink }]}>▸ STAY GOLD ◂</Animated.Text>
      </Animated.View>

      {/* bottom ticker */}
      <View style={styles.tickerClip}>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.ticker,
            vt,
            { transform: [{ translateX: ticker.interpolate({ inputRange: [0, 1], outputRange: [0, -W] }) }] },
          ]}
        >
          {Array.from({ length: 6 }, () => "LUMENATI ▪ CHA-CHING ▪ ").join("")}
        </Animated.Text>
      </View>

      {/* CRT scanlines + rolling sweep — drawn last so the glass sits on top */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: SCANLINES }, (_, i) => (
          <View key={`sl${i}`} style={[styles.scanline, { top: i * 14 }]} />
        ))}
        <Animated.View
          style={[
            styles.sweepBand,
            { transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [-160, H + 160] }) }] },
          ]}
        />
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flash }]} />
    </Animated.View>
    </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    left: CX - 70,
    top: CY - 70,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: {
    color: "#00ffff",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    textShadowColor: "rgba(0,255,255,0.9)",
    textShadowRadius: 12,
    marginBottom: 18,
  },
  paid: {
    color: "#FF1493",
    fontSize: 58,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "rgba(255,20,147,0.95)",
    textShadowRadius: 28,
  },
  amount: {
    color: "#7fff00",
    fontSize: 64,
    fontWeight: "400",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(127,255,0,0.9)",
    textShadowRadius: 16,
    marginTop: 10,
  },
  footer: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    marginTop: 30,
  },
  tickerClip: {
    position: "absolute",
    bottom: 64,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  ticker: {
    color: "rgba(0,255,255,0.8)",
    fontSize: 20,
    letterSpacing: 2,
    width: W * 2.5,
    textShadowColor: "rgba(0,255,255,0.6)",
    textShadowRadius: 8,
  },
  scanline: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sweepBand: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
});
