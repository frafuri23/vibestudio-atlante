import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import FocusablePressable from "./FocusablePressable";
import { radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";

/** Photo-backed game mode card. When the library can't support the mode it is shown
 * disabled with the real reason — never a button that pretends to start a game. */
export function QuizModeCard({
  icon,
  title,
  desc,
  coverUri,
  meta,
  disabledReason,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  coverUri: string | null;
  meta: string;
  disabledReason: string | null;
  onPress: () => void;
}) {
  const { colors, shadow } = useTheme();
  const disabled = disabledReason != null;
  return (
    <FocusablePressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={disabled ? disabledReason ?? undefined : desc}
      accessibilityState={{ disabled }}
      style={({ pressed, hovered }: any) => [
        styles.card,
        { backgroundColor: colors.fill },
        shadow.card,
        (pressed || hovered) && !disabled && { transform: [{ scale: 0.985 }] },
      ]}
    >
      {coverUri ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
      <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.78)"]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.top}>
        <View style={styles.iconWell}>
          <Ionicons name={icon} size={18} color="#FFFFFF" />
        </View>
        <View style={styles.metaPill}>
          <Text style={styles.metaText}>{meta}</Text>
        </View>
      </View>
      <View style={styles.bottom}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc} numberOfLines={2}>
            {disabled ? disabledReason : desc}
          </Text>
        </View>
        {!disabled && (
          <View style={[styles.play, { backgroundColor: colors.surface }]}>
            <Ionicons name="play" size={18} color={colors.accent} style={{ marginLeft: 2 }} />
          </View>
        )}
      </View>
      {disabled && <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} pointerEvents="none" />}
    </FocusablePressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: "hidden", minHeight: 176, padding: spacing.lg, justifyContent: "space-between" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  metaPill: { backgroundColor: "rgba(0,0,0,0.38)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  metaText: { ...type.captionStrong, color: "#FFFFFF" },
  bottom: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  title: { ...type.title2, color: "#FFFFFF" },
  desc: { ...type.subhead, color: "rgba(255,255,255,0.88)", marginTop: 2 },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
