import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the floating tab-bar capsule. Each tab button fills it, so every target
 * is ≥44pt in every runtime (the stock bar left them at ~41pt in the web preview). */
export const TAB_BAR_BASE = 56;

/** Gap between the capsule and the bottom edge. On a phone with a home indicator the
 * capsule sits just above the pill (Liquid Glass style); elsewhere it keeps 12pt. */
export function tabBarBottomGap(insetBottom: number): number {
  return Math.max(insetBottom - 8, 12);
}

/** Total space the floating glass tab bar covers at the bottom of a tab screen
 * (capsule + gap below it). Mirrors components/GlassTabBar exactly. NEVER import
 * useBottomTabBarHeight directly: the web preview doesn't export it. */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_BASE + tabBarBottomGap(insets.bottom) + 8;
}
