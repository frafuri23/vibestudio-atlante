import React from "react";
import { Platform, StyleProp, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from "expo-glass-effect";

/** True only on an iOS 26+ device build: real Apple Liquid Glass. Everywhere else
 * (iOS < 26, Android, the web preview, the published site) the expo-blur material is
 * the fallback. Computed once at module load. */
export const LIQUID = (() => {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

/** Liquid Glass surface with a frosted-blur fallback. Never place it under a parent
 * with opacity < 1 (the glass disappears); animate glassEffectStyle instead. */
export function Glass({ style, children, radius = 20 }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode; radius?: number }) {
  return LIQUID ? (
    <GlassView style={[{ borderRadius: radius }, style]} glassEffectStyle="regular">
      {children}
    </GlassView>
  ) : (
    <BlurView style={[{ borderRadius: radius, overflow: "hidden" }, style]} intensity={60} tint="systemChromeMaterial">
      {children}
    </BlurView>
  );
}
