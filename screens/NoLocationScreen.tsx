import React, { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { PhotoImage } from "../components/PhotoImage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { isValidCoordinate } from "../lib/geo/haversine";

export default function NoLocationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { photos } = useAppState();
  const withoutLocation = useMemo(() => photos.filter((p) => !isValidCoordinate(p.latitude, p.longitude)), [photos]);
  const unreadable = useMemo(() => withoutLocation.filter((p) => p.metadataStatus === "unavailable").length, [withoutLocation]);

  if (withoutLocation.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <EmptyState
          icon="checkmark-circle-outline"
          title="Tutto assegnato"
          message="Ogni foto indicizzata ha una posizione, originale o manuale."
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
      data={withoutLocation}
      keyExtractor={(p) => p.id}
      numColumns={3}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={s.headerBlock}>
          <Text style={s.subtitle}>
            Puoi assegnare manualmente un luogo aprendo una foto — la scelta resta solo in Atlante.
          </Text>
          {unreadable > 0 && (
            <View style={s.notice}>
              <Ionicons name="cloud-offline-outline" size={15} color={colors.warn} />
              <Text style={s.noticeText}>
                {unreadable} di queste hanno metadati non leggibili in questo momento (tipicamente originali ancora solo
                su iCloud): non è confermato che siano senza GPS, riprova la scansione quando sono scaricate.
              </Text>
            </View>
          )}
        </View>
      }
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xxl }}
      columnWrapperStyle={{ gap: spacing.sm }}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [s.tile, pressed && { opacity: 0.75 }]}
          onPress={() => navigation.navigate("PhotoDetail", { photoId: item.id })}
          accessibilityRole="button"
        >
          <PhotoImage uri={item.uri} style={s.tileImage} />
          {item.metadataStatus === "unavailable" && (
            <View style={s.tileFlag}>
              <Text style={s.tileFlagText}>metadati non letti</Text>
            </View>
          )}
        </Pressable>
      )}
    />
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    headerBlock: { gap: spacing.md, marginBottom: spacing.lg },
    subtitle: { ...type.subhead, color: c.secondaryText },
    notice: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "flex-start",
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    noticeText: { ...type.caption, color: c.warn, flex: 1, lineHeight: 17 },
    tile: { flex: 1, aspectRatio: 1, borderRadius: radius.sm, overflow: "hidden", backgroundColor: c.fill },
    tileFlag: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.62)", paddingVertical: 3, paddingHorizontal: 4 },
    tileFlagText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700", textAlign: "center" },
    tileImage: { width: "100%", height: "100%" },
  });
