import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { LIQUID } from "./Glass";
import { useTheme } from "../lib/themeContext";

/**
 * Translucent material drawn as an absolutely-positioned background layer. Put it as
 * the FIRST child of any container (bar, pill, card, sheet) and leave the container
 * itself without a background.
 *
 * - iOS 26+ device build: real Apple Liquid Glass (GlassView), no tint on top — a
 *   solid overlay would kill the refraction.
 * - iOS < 26: system chrome blur material + a thin tint.
 * - Web preview / Android: weaker or no blur, so a stronger tint keeps text contrast.
 */
export function GlassFill({ radius = 0, strong = false }: { radius?: number; strong?: boolean }) {
  const { isDark } = useTheme();

  if (LIQUID) {
    // GlassView follows the iOS system appearance, not the app's Aspetto override:
    // a light translucent tint keeps the glass matched to the app theme (so text on
    // it stays readable) while still letting the refraction through.
    return (
      <GlassView
        pointerEvents="none"
        glassEffectStyle="regular"
        tintColor={isDark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)"}
        style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}
      />
    );
  }

  const ios = Platform.OS === "ios";
  const tint = ios
    ? isDark
      ? `rgba(22,22,24,${strong ? 0.55 : 0.35})`
      : `rgba(255,255,255,${strong ? 0.55 : 0.35})`
    : isDark
      ? `rgba(24,24,26,${strong ? 0.9 : 0.82})`
      : `rgba(252,252,251,${strong ? 0.92 : 0.84})`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={ios ? 80 : 40}
        tint={ios ? (isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight") : isDark ? "dark" : "light"}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: tint,
            borderRadius: radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.7)",
          },
        ]}
      />
    </View>
  );
}
