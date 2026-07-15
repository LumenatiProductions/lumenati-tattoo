import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { theme } from "@/lib/theme";
import { detent, endStop, milestone } from "@/lib/haptics";

// The Apple-Card-style dial: drag around the ring to pick a number. The arc
// fills as you go, the color warms pink → gold → green with ambition, and every
// step lands with a haptic detent. Reanimated runs the drag on the UI thread —
// 60fps, no JS lag.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 300;
const STROKE = 24;
const R = (SIZE - STROKE) / 2 - 6;
const C = 2 * Math.PI * R;
const CX = SIZE / 2;
const CY = SIZE / 2;
// 300° sweep with the gap at the bottom (like a gauge).
const SWEEP = 300;
const START_DEG = 90 + (360 - SWEEP) / 2; // 120° — bottom-left
const ARC = C * (SWEEP / 360);

type Props = {
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  caption: string;
  onChange: (v: number) => void;
};

export default function GoalDial({ value, min, max, step, format, caption, onChange }: Props) {
  // t = 0..1 around the sweep.
  const t = useSharedValue(max > min ? (value - min) / (max - min) : 0);
  const [shown, setShown] = useState(value);
  // True while a finger is on the dial. The sync effect below must never move
  // t.value during a drag — each detent updates the parent's `value`, and if the
  // effect springs t.value back before `shown` catches up, the dial snaps out
  // from under the finger. The finger owns the ring until release.
  const dragging = useRef(false);
  const setDragging = (v: boolean) => {
    dragging.current = v;
  };

  // Re-sync when the caller sets the value from outside (e.g. the "Use suggested"
  // button, or a mode switch). Skipped mid-drag so it can't fight the finger.
  useEffect(() => {
    if (dragging.current) return;
    if (value !== shown) {
      t.value = withSpring(max > min ? (value - min) / (max - min) : 0, { damping: 18, stiffness: 140 });
      setShown(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max, step, caption]);

  const emit = (tv: number) => {
    const raw = min + tv * (max - min);
    const snapped = Math.round(raw / step) * step;
    if (snapped !== shown) {
      // Crown feel: sharp tick per step, rounder thump on big round numbers,
      // heavy clunk at the ends.
      if (snapped === min || snapped === max) endStop();
      else if (snapped % (step * 10) === 0) milestone();
      else detent();
      setShown(snapped);
      onChange(snapped);
    }
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(setDragging)(true);
    })
    .onChange((e) => {
      // Angle of the finger from the dial center, normalized onto the sweep.
      const dx = e.x - CX;
      const dy = e.y - CY;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right
      deg = (deg - START_DEG + 360) % 360; // 0 at sweep start, clockwise
      if (deg > SWEEP) deg = deg - SWEEP < (360 - SWEEP) / 2 ? SWEEP : 0; // clamp the gap
      t.value = deg / SWEEP;
      runOnJS(emit)(t.value);
    })
    .onEnd(() => {
      // Settle exactly onto the snapped value.
      const raw = min + t.value * (max - min);
      const snapped = Math.round(raw / step) * step;
      t.value = withSpring(max > min ? (snapped - min) / (max - min) : 0, { damping: 18, stiffness: 160 });
    })
    .onFinalize(() => {
      // Finger is off — the sync effect may steer the dial again.
      runOnJS(setDragging)(false);
    });

  const color = useDerivedValue(() =>
    interpolateColor(t.value, [0, 0.55, 1], [theme.brand, "#FFD700", theme.good]),
  );

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: ARC * (1 - t.value),
    stroke: color.value,
  }));

  const knobProps = useAnimatedProps(() => {
    const deg = START_DEG + t.value * SWEEP;
    const rad = (deg * Math.PI) / 180;
    return {
      cx: CX + R * Math.cos(rad),
      cy: CY + R * Math.sin(rad),
      fill: color.value,
    };
  });

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={pan}>
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE}>
            {/* track */}
            <Circle
              cx={CX}
              cy={CY}
              r={R}
              stroke="rgba(255,255,255,0.09)"
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${ARC} ${C}`}
              transform={`rotate(${START_DEG} ${CX} ${CY})`}
            />
            {/* filled arc */}
            <AnimatedCircle
              cx={CX}
              cy={CY}
              r={R}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${ARC} ${C}`}
              animatedProps={arcProps}
              transform={`rotate(${START_DEG} ${CX} ${CY})`}
            />
            {/* knob */}
            <AnimatedCircle r={STROKE / 2 + 6} animatedProps={knobProps} stroke="#fff" strokeWidth={3} />
          </Svg>
          {/* center readout */}
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.value}>{format(shown)}</Text>
            <Text style={styles.caption}>{caption}</Text>
          </View>
        </View>
      </GestureDetector>
      <Text style={styles.hint}>Drag around the ring</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  value: { color: theme.text, fontSize: 44, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  caption: { color: theme.textDim, fontSize: 13, fontWeight: "600", marginTop: 4 },
  hint: { color: theme.textFaint, fontSize: 12, marginTop: 2 },
});
