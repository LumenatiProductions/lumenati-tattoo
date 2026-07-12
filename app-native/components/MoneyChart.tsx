import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop, Line, Circle } from "react-native-svg";
import { theme, money } from "@/lib/theme";
import { endStop, picked } from "@/lib/haptics";

// The dopamine chart: cumulative earnings climbing across the range, with the
// goal pace as a dashed line to race. The stroke draws itself in on mount,
// Robinhood-style — and scrubs like Robinhood too: the hairline + dot ride the
// line CONTINUOUSLY under the finger (Animated values, no re-render per frame),
// the readout snaps to the nearest real day, each day crossed gives a light
// selection tick, and the chart's ends land with a firmer stop.

const AnimatedPath = Animated.createAnimatedComponent(Path);

const H = 190;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

type Props = {
  /** Cumulative cents per day, oldest → today (today is the last point). */
  series: number[];
  /** First + last x-axis labels (e.g. "Jun 1" / "today"). */
  startLabel: string;
  endLabel: string;
  /** ISO date of the first point — lets the scrub readout name the day. */
  startISO?: string;
  /** Range goal — draws the pace line. Omit when no goal is set. */
  goalCents?: number;
  /** 3+ week streak turns the pace line gold. */
  streak?: number;
  width: number;
};

// Catmull-Rom → bezier so the line is smooth, not jagged.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function MoneyChart({ series, startLabel, endLabel, startISO, goalCents, streak = 0, width }: Props) {
  const onFire = streak >= 3;
  const draw = useRef(new Animated.Value(0)).current;
  const [drawn, setDrawn] = useState(false);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);

  useEffect(() => {
    draw.setValue(0);
    setDrawn(false);
    Animated.timing(draw, {
      toValue: 1,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // svg props aren't native-driver animatable
    }).start(() => setDrawn(true));
  }, [series, draw]);

  const { linePath, areaPath, paceLine, pts, lastPt, ahead, deltaCents } = useMemo(() => {
    const n = Math.max(2, series.length);
    const vals = series.length ? series : [0, 0];
    const today = vals[vals.length - 1] ?? 0;

    // Pace today = the goal prorated to how far through the range we are.
    const paceToday = goalCents ? Math.round((goalCents * vals.length) / n) : 0;
    const top = Math.max(...vals, goalCents ?? 0, 1);

    const x = (i: number) => (i / (n - 1)) * width;
    const y = (v: number) => PAD_TOP + (1 - v / top) * (H - PAD_TOP - PAD_BOTTOM);

    const points = vals.map((v, i) => ({ x: x(i), y: y(v) }));
    const line = smoothPath(points);
    const area = `${line} L ${points[points.length - 1].x} ${H - PAD_BOTTOM} L ${points[0].x} ${H - PAD_BOTTOM} Z`;

    return {
      linePath: line,
      areaPath: area,
      paceLine: goalCents ? { x1: 0, y1: y(0), x2: width, y2: y(goalCents) } : null,
      pts: points,
      lastPt: points[points.length - 1],
      ahead: goalCents ? today >= paceToday : true,
      deltaCents: goalCents ? today - paceToday : 0,
    };
  }, [series, goalCents, width]);

  // Scrub: the dot + hairline follow the finger every frame via Animated
  // values (setValue skips React re-render — that's the whole smoothness
  // trick). The readout snaps to the nearest real day; a light selection tick
  // marks each day crossed and the chart's ends thunk like a dial's end stop.
  const scrubX = useRef(new Animated.Value(0)).current;
  const scrubY = useRef(new Animated.Value(0)).current;
  const atEnd = useRef(false);

  // y on the polyline for any x — linear between the two neighboring days.
  const yAt = (x: number): number => {
    const n = pts.length;
    if (n < 2) return pts[0]?.y ?? 0;
    const f = Math.min(n - 1, Math.max(0, (x / width) * (n - 1)));
    const i = Math.min(n - 2, Math.floor(f));
    const t = f - i;
    return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
  };

  const track = (rawX: number, isGrant: boolean) => {
    const x = Math.min(width, Math.max(0, rawX));
    scrubX.setValue(x);
    scrubY.setValue(yAt(x));
    const n = pts.length;
    const idx = Math.min(n - 1, Math.max(0, Math.round((x / width) * (n - 1))));
    const edge = x <= 0 || x >= width;
    if (edge && !atEnd.current) endStop();
    atEnd.current = edge;
    if (idx !== scrubRef.current) {
      scrubRef.current = idx;
      setScrubIdx(idx);
      if (!isGrant && !edge) picked();
    }
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          atEnd.current = false;
          track(e.nativeEvent.locationX, true);
          picked();
        },
        onPanResponderMove: (e) => track(e.nativeEvent.locationX, false),
        onPanResponderRelease: () => {
          scrubRef.current = null;
          setScrubIdx(null);
        },
        onPanResponderTerminate: () => {
          scrubRef.current = null;
          setScrubIdx(null);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pts, width],
  );

  // The scrubbed day's date label ("Jun 14"), derived from the range start.
  const scrubDate =
    scrubIdx != null && startISO
      ? new Date(new Date(`${startISO}T00:00:00`).getTime() + scrubIdx * 86400000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : null;
  const scrubbing = scrubIdx != null;

  // Rough path length for the draw-in animation (overshoot is harmless).
  const approxLen = width * 1.8;
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [approxLen, 0] });

  const lineColor = ahead ? theme.good : "rgba(235,240,255,0.55)";

  return (
    <View>
      {/* Readout: scrubbing shows that day's date + running total; at rest,
          the pace delta (when there's a goal to race). */}
      {scrubIdx != null ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>
            {money(series[scrubIdx] ?? 0)}
          </Text>
          <Text style={{ color: theme.textFaint, fontSize: 12.5 }}>
            {scrubDate ? `through ${scrubDate}` : "so far"}
          </Text>
        </View>
      ) : goalCents ? (
        <Text style={{ color: ahead ? theme.good : theme.bad, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>
          {ahead ? "▲" : "▼"} {money(Math.abs(deltaCents))} {ahead ? "ahead of" : "behind"} pace
        </Text>
      ) : null}
      <View {...pan.panHandlers}>
        <Svg width={width} height={H}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity="0.28" />
              <Stop offset="1" stopColor={lineColor} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {/* goal pace line — the thing to race */}
          {paceLine && (
            <Line
              {...paceLine}
              stroke={onFire ? "#FFD700" : "rgba(255,255,255,0.35)"}
              strokeWidth={onFire ? 2 : 1.5}
              strokeDasharray="6 6"
            />
          )}

          {/* earnings area + line, drawing itself in */}
          {drawn && <Path d={areaPath} fill="url(#fill)" />}
          <AnimatedPath
            d={linePath}
            stroke={lineColor}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${approxLen} ${approxLen}`}
            strokeDashoffset={dashOffset}
          />

          {/* today */}
          {drawn && !scrubbing && lastPt && (
            <>
              <Circle cx={lastPt.x} cy={lastPt.y} r={9} fill={lineColor} opacity={0.25} />
              <Circle cx={lastPt.x} cy={lastPt.y} r={4.5} fill={lineColor} />
            </>
          )}
        </Svg>

        {/* scrub hairline + dot — Animated overlays gliding with the finger */}
        {scrubbing && (
          <>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: PAD_TOP,
                left: -0.5,
                width: 1,
                height: H - PAD_TOP - PAD_BOTTOM,
                backgroundColor: "rgba(255,255,255,0.25)",
                transform: [{ translateX: scrubX }],
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -7,
                left: -7,
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: theme.surface,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ translateX: scrubX }, { translateY: scrubY }],
              }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: lineColor }} />
            </Animated.View>
          </>
        )}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: theme.textFaint, fontSize: 11 }}>{startLabel}</Text>
        {goalCents ? (
          <Text style={{ color: onFire ? "#FFD700" : theme.textFaint, fontSize: 11, fontWeight: onFire ? "700" : "400" }}>
            goal {money(goalCents)}{onFire ? ` · ${streak}wk streak` : " ⌁"}
          </Text>
        ) : null}
        <Text style={{ color: theme.textFaint, fontSize: 11 }}>{endLabel}</Text>
      </View>
    </View>
  );
}
