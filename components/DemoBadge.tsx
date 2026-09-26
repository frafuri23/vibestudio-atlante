import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";

/** Always shown when the screen is displaying synthetic fixture data instead of the
 * user's real library — never let demo content pass as real. */
export default function DemoBadge() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: colors.demoBadgeSoft,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 5,
        borderRadius: radius.pill,
        alignSelf: "center",
      }}
    >
      <Ionicons name="sparkles" size={12} color={colors.demoBadge} />
      <Text style={[type.captionStrong, { color: colors.demoBadge }]}>Demo</Text>
    </View>
  );
}
