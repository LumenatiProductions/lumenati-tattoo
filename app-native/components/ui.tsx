import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { theme } from "@/lib/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Stat({
  label,
  value,
  sub,
  accent,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <View style={[styles.stat, accent && { borderColor: theme.brand }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warn && { color: theme.warn }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
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
  tone?: "brand" | "ghost";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        tone === "brand" ? styles.btn : styles.btnGhost,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={tone === "brand" ? styles.btnText : styles.btnGhostText}>{label}</Text>
    </Pressable>
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
    borderRadius: 16,
    padding: 16,
  },
  stat: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexGrow: 1,
    flexBasis: "45%",
  },
  statLabel: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  statValue: { color: theme.text, fontSize: 26, fontWeight: "700", marginTop: 6 },
  statSub: { color: theme.textFaint, fontSize: 12, marginTop: 4 },
  section: {
    color: theme.textDim,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 10,
  },
  btn: { backgroundColor: theme.brand, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnGhost: {
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnGhostText: { color: theme.text, fontSize: 15, fontWeight: "600" },
  track: { height: 10, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  fill: { height: 10, borderRadius: 6 },
});
