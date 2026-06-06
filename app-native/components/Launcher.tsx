import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { theme } from "@/lib/theme";
import type { Role } from "@/lib/auth";

// Role-aware nav into the back-office screens ported to the app (POS 6e). The
// app reads/writes Supabase under RLS, so each role only sees what it can touch.
type Item = { href: string; label: string; roles: Role[] };
const ITEMS: Item[] = [
  { href: "/bookings", label: "Bookings", roles: ["owner", "bookkeeper", "frontdesk", "artist"] },
  { href: "/clients", label: "Clients", roles: ["owner", "bookkeeper", "frontdesk"] },
  { href: "/inventory", label: "Inventory", roles: ["owner", "frontdesk"] },
  { href: "/reports", label: "Reports", roles: ["owner", "bookkeeper"] },
  { href: "/compliance", label: "Compliance", roles: ["owner"] },
  { href: "/expenses", label: "Deductions", roles: ["artist"] },
  { href: "/goals", label: "Goals", roles: ["artist"] },
];

export default function Launcher({ role }: { role: Role | null }) {
  const items = ITEMS.filter((i) => role && i.roles.includes(role));
  if (!items.length) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={styles.section}>Go to</Text>
      <View style={styles.grid}>
        {items.map((it) => (
          <Link key={it.href} href={it.href} style={styles.tile}>
            <Text style={styles.tileText}>{it.label}</Text>
          </Link>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "600", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexGrow: 1,
    flexBasis: "45%",
  },
  tileText: { color: theme.text, fontSize: 16, fontWeight: "600" },
});
