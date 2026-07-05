import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";

// Entry: bounce to the app if signed in, else to sign-in. Mirrors the web's
// role-routed /admin landing.
export default function Index() {
  const { loading, session } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.textDim} />
      </View>
    );
  }
  return <Redirect href={session ? "/home" : "/sign-in"} />;
}
