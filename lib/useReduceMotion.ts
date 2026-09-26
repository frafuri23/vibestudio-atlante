import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useAppState } from "./appState";

/** Resolves Atlante's saved preference against the operating-system accessibility
 * setting. A null override follows the OS; true/false explicitly wins. */
export function useReduceMotion(): boolean {
  const { appSettings } = useAppState();
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setSystemReducedMotion(enabled);
      })
      .catch(() => {
        if (mounted) setSystemReducedMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return appSettings.reduceMotionOverride ?? systemReducedMotion;
}
