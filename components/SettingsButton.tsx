import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../lib/themeContext";

/** Circular header action used by the three tab roots (they draw their own large
 * title, so there is no navigation bar to host a header button). */
export default function SettingsButton() {
  const navigation = useNavigation<any>();
  const { colors, shadow } = useTheme();
  return (
    <Pressable
      onPress={() => navigation.navigate("Settings")}
      accessibilityRole="button"
      accessibilityLabel="Impostazioni"
      hitSlop={10}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
          opacity: pressed ? 0.65 : 1,
        },
        shadow.card,
      ]}
    >
      <Ionicons name="ellipsis-horizontal" size={20} color={colors.accent} />
    </Pressable>
  );
}
