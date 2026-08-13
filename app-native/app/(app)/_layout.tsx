import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { PreviewProvider } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { registerPush } from "@/lib/push";
import BugReporter from "@/components/BugReporter";

// Auth guard for the signed-in area. No session -> back to sign-in.
export default function AppLayout() {
  const { loading, session, role, refresh, signOut } = useAuth();

  // Opt this device into push once signed in (no-op until EAS is set up).
  useEffect(() => {
    if (session) registerPush();
  }, [session]);

  // Web: paint the page behind the phone-width column ink-black. The +html
  // shell handles this on fresh serves; this covers the running dev server.
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.body.style.background = theme.bg;
      document.documentElement.style.background = theme.bg;
    }
  }, []);
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.textDim} />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  // Signed in but the profile hasn't resolved (read timed out, or the account
  // isn't on any shop yet). NEVER route by a fabricated role — show a retry
  // instead, so an owner is never painted as an artist with shop-wide data.
  if (role == null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 32, gap: 16 }}>
        <Text style={{ color: theme.text, fontSize: 17, fontWeight: "600", textAlign: "center" }}>
          We couldn&apos;t load your account
        </Text>
        <Text style={{ color: theme.textDim, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
          Check your connection and try again. If this keeps happening, your number or email may not be on the shop yet.
        </Text>
        <Pressable
          onPress={refresh}
          style={{ backgroundColor: theme.text, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}
        >
          <Text style={{ color: theme.bg, fontWeight: "700" }}>Try again</Text>
        </Pressable>
        <Pressable onPress={signOut} style={{ paddingVertical: 8 }}>
          <Text style={{ color: theme.textDim, fontSize: 14 }}>Sign out</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <PreviewProvider>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          // On web the phone UI otherwise stretches across the whole desktop
          // window — cap the entire app at a phone-ish centered column.
          ...(Platform.OS === "web"
            ? { maxWidth: 560, width: "100%", alignSelf: "center" as const }
            : null),
        }}
      >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          // Themed header defaults so screens that turn the header on never
          // flash the system blue/white chrome while their options load.
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      </View>
      <BugReporter />
    </PreviewProvider>
  );
}
