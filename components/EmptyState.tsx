import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";

export default function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.accentSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.xs,
        }}
      >
        <Ionicons name={icon} size={30} color={colors.accent} />
      </View>
      <Text style={[type.title3, { color: colors.text, textAlign: "center" }]}>{title}</Text>
      <Text style={[type.subhead, { color: colors.secondaryText, textAlign: "center", maxWidth: 320 }]}>{message}</Text>
      {action}
    </View>
  );
}
