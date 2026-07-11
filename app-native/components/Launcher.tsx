import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { tap } from "@/lib/haptics";
import type { Role } from "@/lib/auth";

// Role-aware nav into the back-office screens ported to the app (POS 6e). The
// app reads/writes Supabase under RLS, so each role only sees what it can touch.
// Grouped into the same categories as the web Command Center sidebar; a section
// header only shows when the role can see at least one screen inside it.
type Item = { href: string; label: string; icon: keyof typeof Ionicons.glyphMap; roles: Role[] };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Go to",
    items: [
      { href: "/pos", label: "Take payment", icon: "card-outline", roles: ["owner", "artist"] },
    ],
  },
  {
    title: "Front of house",
    items: [
      { href: "/room", label: "My Page", icon: "color-palette-outline", roles: ["owner", "artist"] },
      { href: "/bookings", label: "Bookings", icon: "calendar-outline", roles: ["owner", "artist"] },
      { href: "/waitlist", label: "Waitlist", icon: "hourglass-outline", roles: ["owner", "artist"] },
      { href: "/clients", label: "Clients", icon: "people-outline", roles: ["owner"] },
      { href: "/intake", label: "Intake", icon: "document-text-outline", roles: ["owner"] },
      { href: "/followups", label: "Follow-ups", icon: "chatbubble-ellipses-outline", roles: ["owner"] },
      { href: "/social", label: "Social", icon: "image-outline", roles: ["owner"] },
    ],
  },
  {
    title: "Finances",
    items: [
      { href: "/payouts", label: "Pay", icon: "swap-horizontal-outline", roles: ["owner", "artist"] },
      { href: "/reports", label: "Reports", icon: "stats-chart-outline", roles: ["owner"] },
      { href: "/rent", label: "Booth rent", icon: "key-outline", roles: ["owner"] },
      { href: "/cash", label: "Cash log", icon: "cash-outline", roles: ["owner"] },
      { href: "/reconcile", label: "Reconcile", icon: "git-compare-outline", roles: ["owner"] },
    ],
  },
  {
    title: "My business",
    items: [
      { href: "/my-clients", label: "My clients", icon: "people-circle-outline", roles: ["artist"] },
      { href: "/qr-card", label: "Booking card", icon: "qr-code-outline", roles: ["artist"] },
      { href: "/promos", label: "Promos", icon: "megaphone-outline", roles: ["artist"] },
      { href: "/healed-shots", label: "Healed shots", icon: "sparkles-outline", roles: ["artist"] },
      { href: "/expenses", label: "Deductions", icon: "receipt-outline", roles: ["artist"] },
      { href: "/goals", label: "Goals", icon: "flag-outline", roles: ["artist"] },
      { href: "/compliance", label: "My license", icon: "shield-checkmark-outline", roles: ["artist"] },
    ],
  },
  {
    title: "Shop",
    items: [
      { href: "/inventory", label: "Inventory", icon: "cube-outline", roles: ["owner"] },
      { href: "/compliance", label: "Compliance", icon: "shield-checkmark-outline", roles: ["owner"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/staff", label: "Staff", icon: "person-add-outline", roles: ["owner"] },
      { href: "/integrations", label: "Integrations", icon: "link-outline", roles: ["owner"] },
    ],
  },
];

export default function Launcher({ role }: { role: Role | null }) {
  const router = useRouter();
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => role && i.roles.includes(role)),
  })).filter((s) => s.items.length > 0);
  if (!sections.length) return null;
  return (
    <View style={{ marginTop: 26 }}>
      {sections.map((s, idx) => (
        <View key={s.title} style={idx === 0 ? undefined : { marginTop: 22 }}>
          <Text style={styles.section}>{s.title}</Text>
          <View style={styles.grid}>
            {s.items.map((it) => (
              <Pressable
                key={it.href}
                onPress={() => {
                  tap();
                  router.push(it.href as never);
                }}
                style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={it.icon} size={18} color={theme.textDim} />
                </View>
                <Text style={styles.tileText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{it.label}</Text>
                <Ionicons name="chevron-forward" size={15} color={theme.textFaint} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
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
    maxWidth: "48.6%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tilePressed: { backgroundColor: theme.surfaceRaised, borderColor: theme.borderStrong },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { color: theme.text, fontSize: 15.5, fontWeight: "600", flex: 1 },
});
