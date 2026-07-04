import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { computeRewards } from "@/lib/rewards";
import type { MoneySnapshot, Goals } from "@/lib/personal";

// Earned achievements as a horizontal strip of chips, colored by tone, with a
// dashed "Next:" teaser for the closest one left to chase. Tasteful, not corny.

const TONE: Record<string, string> = { brand: theme.brand, gold: "#FFD700", good: theme.good };

export default function RewardsStrip({ snap, goals }: { snap: MoneySnapshot; goals: Goals }) {
  const { earned, next } = computeRewards(snap, goals);
  if (earned.length === 0 && !next) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {earned.map((b) => (
        <View key={b.id} style={[styles.chip, { borderColor: TONE[b.tone] }]}>
          <Ionicons name={b.icon as never} size={15} color={TONE[b.tone]} />
          <Text style={styles.chipText}>{b.label}</Text>
        </View>
      ))}
      {next && (
        <View style={[styles.chip, styles.next]}>
          <Ionicons name={next.icon as never} size={15} color={theme.textFaint} />
          <Text style={[styles.chipText, { color: theme.textFaint }]}>Next: {next.label}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: theme.surface,
  },
  next: { borderColor: theme.border, borderStyle: "dashed" },
  chipText: { color: theme.text, fontSize: 13, fontWeight: "600" },
});
