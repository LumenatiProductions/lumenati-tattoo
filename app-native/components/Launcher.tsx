import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import type { Role } from "@/lib/auth";

// Role-aware nav into the back-office screens ported to the app (POS 6e). The
// app reads/writes Supabase under RLS, so each role only sees what it can touch.
type Item = { href: string; label: string; icon: keyof typeof Ionicons.glyphMap; roles: Role[] };
const ITEMS: Item[] = [
  { href: "/bookings", label: "Bookings", icon: "calendar-outline", roles: ["owner", "bookkeeper", "frontdesk", "artist"] },
  { href: "/clients", label: "Clients", icon: "people-outline", roles: ["owner", "bookkeeper", "frontdesk"] },
  { href: "/inventory", label: "Inventory", icon: "cube-outline", roles: ["owner", "frontdesk"] },
  { href: "/reports", label: "Reports", icon: "stats-chart-outline", roles: ["owner", "bookkeeper"] },
  { href: "/compliance", label: "Compliance", icon: "shield-checkmark-outline", roles: ["owner"] },
  { href: "/expenses", label: "Deductions", icon: "receipt-outline", roles: ["artist"] },
  { href: "/goals", label: "Goals", icon: "flag-outline", roles: ["artist"] },
];

export default function Launcher({ role }: { role: Role | null }) {
  const router = useRouter();
  const items = ITEMS.filter((i) => role && i.roles.includes(role));
  if (!items.length) return null;
  return (
    <View style={{ marginTop: 26 }}>
      <Text style={styles.section}>Go to</Text>
      <View style={styles.grid}>
        {items.map((it) => (
          <Pressable
            key={it.href}
            onPress={() => router.push(it.href as never)}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={it.icon} size={18} color={theme.brand} />
            </View>
            <Text style={styles.tileText}>{it.label}</Text>
            <Ionicons name="chevron-forward" size={15} color={theme.textFaint} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    color: theme.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "700",
    marginBottom: 10,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexGrow: 1,
    flexBasis: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tilePressed: { backgroundColor: theme.surfaceRaised, borderColor: theme.borderStrong },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { color: theme.text, fontSize: 15.5, fontWeight: "600", flex: 1 },
});
