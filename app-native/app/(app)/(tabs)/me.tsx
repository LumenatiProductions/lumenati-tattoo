import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { tap } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { apiDelete } from "@/lib/appApi";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import Launcher from "@/components/Launcher";
import PreviewBanner from "@/components/PreviewBanner";
import { Button } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = { owner: "Admin", artist: "Artist" };

// Screens that already have a tab, or live on the Money tab. Everything else
// the role can open is listed here, grouped the way the web sidebar groups it.
const ON_A_TAB = ["/pos", "/bookings", "/clients", "/my-clients", "/payouts", "/reports", "/rent", "/cash", "/reconcile", "/goals", "/expenses"];

// Me. Your page, the rest of the tools, and the account controls. The owner's
// view-as-artist chips live here too, so they're one tab away from anywhere.
export default function Me() {
  const { role, email, fullName, signOut, shopId } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, setPreview } = usePreview();
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [shopName, setShopName] = useState<string | null>(null);
  const effectiveRole = preview ? "artist" : role;
  const name = (fullName ?? "").trim() || (email ?? "").split("@")[0];

  useEffect(() => {
    if (!shopId) return;
    supabase.from("shops").select("name").eq("id", shopId).maybeSingle()
      .then(({ data }) => setShopName((data?.name as string | null) ?? null));
    if (role === "owner") {
      supabase.from("artists").select("id, name").eq("shop_id", shopId).eq("active", true).order("sort")
        .then(({ data }) => setRoster((data ?? []) as { id: string; name: string }[]));
    }
  }, [role, shopId]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
    <InkWash />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <Text style={styles.title}>{preview ? preview.name : name}</Text>
      <Text style={styles.sub}>
        {preview ? "Artist · preview" : role ? ROLE_LABEL[role] ?? role : ""}
        {shopName ? ` · ${shopName}` : ""}
      </Text>
      <PreviewBanner />

      {/* The page is the artist's storefront: first thing on Me. */}
      <Pressable
        onPress={() => {
          tap();
          router.push("/room");
        }}
        style={({ pressed }) => [styles.pageRow, pressed && { backgroundColor: theme.surfaceRaised }]}
      >
        <View style={styles.pageIcon}>
          <Ionicons name="color-palette-outline" size={20} color={theme.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{effectiveRole === "owner" ? "Artist pages" : "My Page"}</Text>
          <Text style={styles.pageSub}>
            {effectiveRole === "owner" ? "Every artist's public page, edit any of them." : "Your public page: work, flash, socials, booking link."}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
      </Pressable>

      <Launcher role={effectiveRole} exclude={[...ON_A_TAB, "/room"]} />

      {role === "owner" && !preview && roster.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <Text style={styles.sectionLabel}>View as artist</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {roster.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setPreview({ artistId: a.id, name: a.name })}
                style={({ pressed }) => [styles.previewChip, pressed && { borderColor: theme.borderStrong }]}
              >
                <Text style={styles.previewChipText}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={{ marginTop: 32 }}>
        <Text style={styles.sectionLabel}>Account</Text>
        <Text style={styles.accountLine}>{email}</Text>
        <View style={{ height: 12 }} />
        <Button label="Sign out" tone="ghost" onPress={signOut} />
      </View>
      {!preview && <DeleteAccount signOut={signOut} />}
    </ScrollView>
    </View>
  );
}

// App Store 5.1.1(v): accounts must be deletable from inside the app. Quiet
// footer action; double-confirmed; the server refuses a shop's only admin.
function DeleteAccount({ signOut }: { signOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = () =>
    Alert.alert(
      "Delete your account?",
      "This removes your login and personal data from Lumenati. Shop records like bookings and sales stay with the shop. This can't be undone.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const r = await apiDelete("/api/account");
            setBusy(false);
            if (!r.ok) {
              Alert.alert("Couldn't delete your account", r.error ?? "Try again in a minute.");
              return;
            }
            signOut();
          },
        },
      ],
    );
  return (
    <Pressable onPress={confirm} disabled={busy} hitSlop={10} style={{ marginTop: 40, alignSelf: "center", opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: theme.textDim, fontSize: 13, textDecorationLine: "underline" }}>
        {busy ? "Deleting your account…" : "Delete my account"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
  sub: { color: theme.textFaint, fontSize: 14, marginTop: 4 },
  pageRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderTopColor: theme.glassEdge,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  pageIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  pageSub: { color: theme.textFaint, fontSize: 12.5, marginTop: 2 },
  sectionLabel: {
    color: theme.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "700",
    marginBottom: 10,
  },
  previewChip: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  previewChipText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
  accountLine: { color: theme.textDim, fontSize: 14 },
});
