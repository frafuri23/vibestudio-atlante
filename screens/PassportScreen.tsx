import React, { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";

export default function PassportScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { memories } = useAppState();

  // "Stamps" are derived from confirmed memories' locations, not a claim of verified
  // physical presence — per the plan, these are "luoghi nei tuoi ricordi".
  const stamps = useMemo(
    () =>
      memories
        .filter((m) => m.status === "confirmed")
        .map((m) => ({ id: m.id, label: m.placeName ?? m.title, memoryId: m.id })),
    [memories],
  );

  if (stamps.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <EmptyState
          icon="ribbon-outline"
          title="Nessun timbro ancora"
          message="Conferma un ricordo suggerito per aggiungere il suo timbro qui."
        />
      </SafeAreaView>
    );
  }

  return (
    // SafeAreaView (frame-aware) protects the top inset when no navigation bar is
    // shown; under the native header it resolves to 0 and never double-insets.
    <SafeAreaView style={s.root} edges={["top"]}>
    <FlatList
      style={s.root}
      contentInsetAdjustmentBehavior="automatic"
      data={stamps}
      keyExtractor={(item) => item.id}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Text style={s.subtitle}>Luoghi nei tuoi ricordi — non una presenza fisica verificata.</Text>
      }
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
      columnWrapperStyle={{ gap: spacing.md }}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [s.stamp, shadow.card, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          onPress={() => navigation.navigate("MemoryDetail", { memoryId: item.memoryId })}
          accessibilityRole="button"
        >
          <View style={s.medallion}>
            <Ionicons name="location" size={22} color={colors.accent} />
          </View>
          <Text style={s.stampLabel} numberOfLines={2}>
            {item.label}
          </Text>
        </Pressable>
      )}
    />
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    subtitle: { ...type.subhead, color: c.secondaryText, marginBottom: spacing.lg },
    stamp: {
      flex: 1,
      aspectRatio: 1,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      padding: spacing.md,
    },
    medallion: {
      width: 54,
      height: 54,
      borderRadius: 27,
      borderWidth: 1.5,
      borderColor: c.accentSoft,
      backgroundColor: c.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    stampLabel: { ...type.footnoteStrong, color: c.text, textAlign: "center" },
  });
