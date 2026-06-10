import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { theme } from "@/lib/theme";

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
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
  /** Full-width money moment: bigger, pink wash, glow. */
  hero?: boolean;
}) {
  return (
    <View
      style={[
        styles.stat,
        accent && styles.statAccent,
        hero && [styles.statHero, theme.glow],
      ]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tnum, warn && { color: theme.warn }, hero && styles.statValueHero]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "brand" | "ghost" | "danger";
}) {
  const base =
    tone === "brand" ? styles.btn : tone === "danger" ? styles.btnDanger : styles.btnGhost;
  const textStyle =
    tone === "brand" ? styles.btnText : tone === "danger" ? styles.btnDangerText : styles.btnGhostText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        base,
        tone === "brand" && !disabled && theme.glow,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={textStyle}>{label}</Text>
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
      onPress={onPress}
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
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  stat: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
    flexGrow: 1,
    flexBasis: "45%",
  },
  statAccent: { borderColor: theme.brandBorder, backgroundColor: theme.brandSoft },
  statHero: {
    flexBasis: "100%",
    backgroundColor: theme.brandSoft,
    borderColor: theme.brandBorder,
    paddingVertical: 20,
  },
  statLabel: { color: theme.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600" },
  statValue: { color: theme.text, fontSize: 26, fontWeight: "700", marginTop: 6, letterSpacing: -0.4 },
  statValueHero: { fontSize: 40, fontWeight: "800", letterSpacing: -1, marginTop: 8 },
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
  btnGhost: {
    borderColor: theme.borderStrong,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  btnGhostText: { color: theme.text, fontSize: 15, fontWeight: "600" },
  btnDanger: { backgroundColor: theme.badSoft, borderColor: "rgba(251,113,133,0.4)", borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: "center" },
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
