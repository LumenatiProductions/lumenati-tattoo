import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";

// "Viewing as <artist>" strip for the owner's view-as mode. Sits under the
// header on every tab so it's always obvious whose numbers are on screen, and
// Exit is always one tap away.
export default function PreviewBanner() {
  const { preview, setPreview } = usePreview();
  if (!preview) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Viewing as {preview.name}</Text>
      <Pressable onPress={() => setPreview(null)} hitSlop={8}>
        <Text style={styles.exit}>Exit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.surfaceRaised,
    borderColor: theme.border,
    borderTopColor: theme.glassEdge,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  text: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
  exit: { color: theme.text, fontSize: 13.5, fontWeight: "700" },
});
