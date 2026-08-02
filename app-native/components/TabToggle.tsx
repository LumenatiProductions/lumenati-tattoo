import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

// The shared range/tab toggle: bordered pills where the active one gets the
// white lift. Selection is a lift, not a pink fill; pink stays money-only.
// Canonical style lifted from the artist home's range toggle.
export default function TabToggle({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ key: string; label: string }>;
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          style={[styles.tab, value === o.key && styles.tabOn]}
        >
          <Text style={[styles.tabText, value === o.key && styles.tabTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderColor: theme.border, borderWidth: 1 },
  tabOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  tabText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  tabTextOn: { color: "#fff" },
});
