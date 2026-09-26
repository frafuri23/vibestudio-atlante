import React from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";

/**
 * The app's screen title block, modelled on iOS' large title: 34pt bold with tight
 * leading, an optional secondary line, and an optional trailing accessory.
 * Used by the tab roots, which draw their own header (no navigation bar).
 */
export default function ScreenHeader({
  title,
  subtitle,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xs,
          paddingBottom: spacing.md,
        },
        style,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[type.largeTitle, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.subhead, { color: colors.secondaryText, marginTop: 1 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
