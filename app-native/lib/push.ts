import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

// Register this device for push (POS-STARTER-6, last mile). Best-effort:
// - web has no push here → no-op.
// - getExpoPushTokenAsync needs an EAS projectId + a dev build; in Expo Go /
//   without a projectId it throws, which we swallow. Once Scott sets up EAS,
//   tokens flow and the daily ops job can nudge the right people.
export async function registerPush(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    let granted = (await Notifications.getPermissionsAsync()).granted;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync();
    const { data: u } = await supabase.auth.getUser();
    if (!token || !u.user) return;

    await supabase.from("device_tokens").upsert({
      token,
      user_id: u.user.id,
      email: u.user.email ?? null,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* no EAS projectId / dev build yet — silently skip */
  }
}
