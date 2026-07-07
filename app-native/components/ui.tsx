import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { theme, money } from "@/lib/theme";
import { tap, trouble } from "@/lib/haptics";

// The app's component kit. Every screen builds from these so the whole app
// moves together: soft depth on cards, pressed states on everything tappable,
// tabular numerals on money, pink reserved for the primary action + the hero
// money moment.

const tnum: TextStyle = { fontVariant: ["tabular-nums"] };

export function Card({
  children,
  style,
  raised,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  raised?: boolean;
}) {
  return <View style={[styles.card, raised && [{ backgroundColor: theme.surfaceRaised }, theme.shadow], style]}>{children}</View>;
}

export function Stat({
  label,
  value,
  sub,
  accent,
  warn,
  hero,
  countTo,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
  /** Full-width money moment: bigger, pink wash, glow. */
  hero?: boolean;
  /** Cents: the value ticks up from 0 on mount instead of just appearing. */
  countTo?: number;
  /** Makes the tile tappable — a glance number that opens its screen. */
  onPress?: () => void;
}) {
  const display = countTo !== undefined ? <CountUpText cents={countTo} /> : value;
  const body = (
    <>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tnum, warn && { color: theme.warn }, hero && styles.statValueHero]}>{display}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </>
  );
  const boxStyle: StyleProp<ViewStyle> = [
    styles.stat,
    accent && styles.statAccent,
    hero && [styles.statHero, theme.shadow],
  ];
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        style={({ pressed }) => [boxStyle, pressed && { borderColor: theme.borderStrong, opacity: 0.85 }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={boxStyle}>{body}</View>;
}

// Money ticking up beats money appearing. Re-runs whenever cents changes.
function CountUpText({ cents }: { cents: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const sub = v.addListener(({ value }) => setShown(Math.round(value)));
    Animated.timing(v, { toValue: cents, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return <>{money(shown)}</>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  tone = "brand",
  big,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "brand" | "ghost" | "danger";
  /** Hero-sized: taller, bigger type. For THE action on a screen. */
  big?: boolean;
}) {
  const base =
    tone === "brand" ? styles.btn : tone === "danger" ? styles.btnDanger : styles.btnGhost;
  const textStyle =
    tone === "brand" ? styles.btnText : tone === "danger" ? styles.btnDangerText : styles.btnGhostText;
  return (
    <Pressable
      onPress={() => {
        (tone === "danger" ? trouble : tap)();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        base,
        big && styles.btnBig,
        tone === "brand" && !disabled && theme.glow,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[textStyle, big && styles.btnBigText]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Compact in-row verb (share, end, edit, save). ONE shared size app-wide so
 * the width system reads: full-width Button = the screen's next action,
 * ActionPill = a small verb attached to the row it sits in. Never full width.
 */
export function ActionPill({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        (danger ? trouble : tap)();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        danger && styles.pillDanger,
        pressed && { backgroundColor: theme.surfaceRaised, borderColor: theme.borderStrong },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[styles.pillText, danger && { color: theme.bad }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
}) {
  const map = {
    neutral: { bg: "rgba(255,255,255,0.07)", fg: theme.textDim },
    good: { bg: theme.goodSoft, fg: theme.good },
    warn: { bg: theme.warnSoft, fg: theme.warn },
    bad: { bg: theme.badSoft, fg: theme.bad },
    brand: { bg: theme.brandSoft, fg: theme.brand },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

/** A tappable list row: title, optional sub line, optional right element. */
export function ListRow({
  title,
  sub,
  right,
  onPress,
  first,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
}) {
  const inner = (
    <>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </>
  );
  if (!onPress) {
    return <View style={[styles.row, !first && styles.rowDivider]}>{inner}</View>;
  }
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && { backgroundColor: "rgba(255,255,255,0.03)" }]}
    >
      {inner}
    </Pressable>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyDot} />
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

// A horizontal progress bar (goal pacing). pct 0..1.
export function ProgressBar({ pct, tone = theme.brand }: { pct: number; tone?: string }) {
  const w = `${Math.max(0, Math.min(1, pct)) * 100}%` as const;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: w, backgroundColor: tone }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Glass panels: translucent fill, lit from the top edge. The lighter top
  // border is what sells the material — light hits glass from above.
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderTopColor: theme.glassEdge,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  stat: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderTopColor: theme.glassEdge,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
    flexGrow: 1,
    flexBasis: "45%",
  },
  statAccent: { borderColor: theme.brandBorder, backgroundColor: theme.brandSoft },
  // The hero money tile is glass like everything else — the NUMBER is the
  // event, not a pink box around it. Pink stays reserved for money actions.
  statHero: {
    flexBasis: "100%",
    backgroundColor: theme.surfaceRaised,
    borderColor: theme.border,
    borderTopColor: theme.glassEdge,
    paddingVertical: 22,
  },
  statLabel: { color: theme.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600" },
  statValue: { color: theme.text, fontSize: 28, fontWeight: "700", marginTop: 6, letterSpacing: -0.5 },
  statValueHero: { fontSize: 52, fontWeight: "800", letterSpacing: -1.6, marginTop: 8 },
  statSub: { color: theme.textFaint, fontSize: 12, marginTop: 4 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 10 },
  section: {
    color: theme.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "700",
  },
  btn: { backgroundColor: theme.brand, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  btnBig: { paddingVertical: 21, borderRadius: theme.radius.lg },
  btnBigText: { fontSize: 19 },
  btnGhost: {
    borderColor: theme.borderStrong,
    borderTopColor: theme.glassEdge,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: theme.surface,
  },
  btnGhostText: { color: theme.text, fontSize: 15, fontWeight: "600" },
  btnDanger: { backgroundColor: theme.badSoft, borderColor: "rgba(251,113,133,0.4)", borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: "center" },
  pill: { alignSelf: "flex-start", borderColor: theme.border, borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.03)" },
  pillDanger: { borderColor: "rgba(251,113,133,0.4)" },
  pillText: { color: theme.text, fontSize: 13, fontWeight: "600" },
  btnDangerText: { color: theme.bad, fontSize: 15, fontWeight: "700" },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3.5, alignSelf: "flex-start" },
  badgeText: { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.3 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 2 },
  rowDivider: { borderTopColor: theme.border, borderTopWidth: 1 },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  rowSub: { color: theme.textDim, fontSize: 13, marginTop: 3, lineHeight: 18 },
  empty: { alignItems: "center", paddingVertical: 28, gap: 10 },
  emptyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.brandSoft, borderColor: theme.brandBorder, borderWidth: 1 },
  emptyText: { color: theme.textFaint, fontSize: 14, textAlign: "center", lineHeight: 20 },
  track: { height: 10, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  fill: { height: 10, borderRadius: 6 },
});
