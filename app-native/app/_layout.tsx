import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { theme } from "@/lib/theme";

// Root layout: providers + a header-less stack. Auth state lives in AuthProvider
// so every route (and all three targets) shares one session.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: "fade",
          }}
        />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
