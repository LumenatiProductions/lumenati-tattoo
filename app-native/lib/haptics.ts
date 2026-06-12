import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// One vocabulary of touch for the whole app. Semantic, not mechanical — call
// sites say what HAPPENED (tap, picked, money, trouble), this file decides how
// it feels. All fire-and-forget and no-ops on web.

const ios = Platform.OS !== "web";

/** Light tick — any tappable thing acknowledging the finger (buttons, tiles, rows). */
export const tap = () => {
  if (ios) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/** Selection tick — choosing among options (chips, pickers, toggles). */
export const picked = () => {
  if (ios) Haptics.selectionAsync().catch(() => {});
};

/** Firm thump — something big is about to happen (the tap-to-pay sheet). */
export const armed = () => {
  if (ios) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

/** Success notification — the OS's "it worked" pattern. */
export const success = () => {
  if (ios) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

/** Warning/destructive moment — voids, removals, declines. */
export const trouble = () => {
  if (ios) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
};

/** The money blast: success + escalating thumps timed for Y2kPaidFX. */
export const chaChing = () => {
  if (!ios) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), 220);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 480); // the slam lands
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 700);
};
