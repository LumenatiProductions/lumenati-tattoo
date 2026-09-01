import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";

// The five places the app lives: Today, Book, Money, Clients, Me. Everything
// else is a detail screen pushed on top by the outer stack (with a back button),
// so the tab bar is the whole map and the home never has to be a launcher.
//
// Clients is one tab with two screens behind it: the shop-wide book for an
// owner, the artist's own people for an artist (and for an owner previewing
// as one). `href: null` keeps the unused one out of the bar.
type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (on: IconName, off: IconName) =>
  ({ color, focused }: { color: string; focused: boolean }) =>
    <Ionicons name={focused ? on : off} size={22} color={color} />;

export default function TabsLayout() {
  const { role } = useAuth();
  const { preview } = usePreview();
  const asOwner = role === "owner" && !preview;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.bg },
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarStyle: {
          backgroundColor: "#0e0e18",
          borderTopColor: theme.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 68, paddingBottom: 12, paddingTop: 8 } : null),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Today", tabBarIcon: icon("sunny", "sunny-outline") }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: icon("calendar", "calendar-outline") }} />
      <Tabs.Screen name="money" options={{ title: "Money", tabBarIcon: icon("cash", "cash-outline") }} />
      <Tabs.Screen
        name="clients"
        options={{ href: asOwner ? "/clients" : null, title: "Clients", tabBarIcon: icon("people", "people-outline") }}
      />
      <Tabs.Screen
        name="my-clients"
        options={{ href: asOwner ? null : "/my-clients", title: "Clients", tabBarIcon: icon("people", "people-outline") }}
      />
      <Tabs.Screen name="me" options={{ title: "Me", tabBarIcon: icon("person-circle", "person-circle-outline") }} />
    </Tabs>
  );
}
