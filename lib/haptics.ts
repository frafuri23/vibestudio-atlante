import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Light, native-feeling feedback on key taps. Inert on web and never throws: a
 * missing haptic engine must not break the action it accompanies. */
export function tapFeedback() {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => {});
}

export function impactFeedback() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successFeedback() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
