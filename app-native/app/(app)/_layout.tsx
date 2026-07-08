import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { PreviewProvider } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { registerPush } from "@/lib/push";
import BugReporter from "@/components/BugReporter";

// Auth guard for the signed-in area. No session -> back to sign-in.
export default function AppLayout() {
  const { loading, session } = useAuth();

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
