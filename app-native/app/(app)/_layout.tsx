import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";

// Auth guard for the signed-in area. No session -> back to sign-in.
export default function AppLayout() {
  const { loading, session } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />;
}
