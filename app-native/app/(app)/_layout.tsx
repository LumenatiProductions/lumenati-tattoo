import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { PreviewProvider } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { registerPush } from "@/lib/push";

// Auth guard for the signed-in area. No session -> back to sign-in.
export default function AppLayout() {
  const { loading, session } = useAuth();

  // Opt this device into push once signed in (no-op until EAS is set up).
  useEffect(() => {
    if (session) registerPush();
  }, [session]);
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
    </PreviewProvider>
  );
}
