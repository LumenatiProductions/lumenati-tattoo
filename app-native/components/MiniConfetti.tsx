import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

// A small one-shot confetti pop — the goal-hit moment. Deliberately quieter
// than the PAID blast: 16 pieces, ~1.2s, no backdrop, no sound and fury.

const PALETTE = ["#FF1493", "#00ffff", "#7fff00", "#FFD700", "#ffffff"];
const N = 16;

export default function MiniConfetti({ onDone }: { onDone: () => void }) {
  const pieces = useRef(
    Array.from({ length: N }, (_, i) => {
      const theta = -Math.PI * (0.15 + 0.7 * Math.random()); // mostly upward
      const dist = 60 + Math.random() * 110;
      return {
        dx: Math.cos(theta) * dist,
        dy: Math.sin(theta) * dist,
        size: 4 + Math.random() * 6,
        color: PALETTE[i % PALETTE.length],
        v: new Animated.Value(0),
      };
    }),
  ).current;

  useEffect(() => {
    Animated.stagger(
      12,
      pieces.map((p) =>
        Animated.timing(p.v, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ).start(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "40%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            opacity: p.v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              {
                translateY: p.v.interpolate({
                  inputRange: [0, 0.55, 1],
                  outputRange: [0, p.dy, p.dy + 70], // up, then gravity
                }),
              },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "260deg"] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
