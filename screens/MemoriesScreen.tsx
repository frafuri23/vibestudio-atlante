import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { PhotoImage } from "../components/PhotoImage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarHeight } from "../lib/useTabBarHeight";
import DemoBadge from "../components/DemoBadge";
import EmptyState from "../components/EmptyState";
import ScreenHeader from "../components/ScreenHeader";
import SettingsButton from "../components/SettingsButton";
import FocusablePressable from "../components/FocusablePressable";
import { TimelineView } from "../components/TimelineView";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { tapFeedback } from "../lib/haptics";

type Segment = "chapters" | "timeline";

export default function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  // Lists scroll under the translucent tab bar; this keeps the last item reachable.
  const bottomPad = useTabBarHeight() + spacing.xl;
  const navigation = useNavigation<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const { mode, memories, photos, overrides } = useAppState();
  const [segment, setSegment] = useState<Segment>("chapters");
  const photoById = useMemo(() => Object.fromEntries(photos.map((p) => [p.id, p])), [photos]);
  const visibleMemories = useMemo(
    () => {
      // Suggestions left over from the previous engine version are superseded once
      // the current engine has produced chapters: never show them as duplicates.
      const hasCurrent = memories.some((m) => (m.algorithmVersion ?? 1) >= 2);
      return memories
        .filter((m) => m.status !== "dismissed")
        .filter((m) => !(hasCurrent && !m.userEdited && (m.algorithmVersion ?? 1) < 2))
        .sort((a, b) => (b.periodStart ?? 0) - (a.periodStart ?? 0));
    },
    [memories],
  );
  const timelinePhotos = useMemo(() => photos.filter((p) => !overrides[p.id]?.excludeFromApp), [photos, overrides]);
  const confirmedCount = useMemo(() => memories.filter((m) => m.status === "confirmed").length, [memories]);
  const cityCount = useMemo(() => new Set(memories.map((m) => m.placeName).filter(Boolean)).size, [memories]);
  const contentW = Math.min(width, 760);

  const segmentBtn = (key: Segment, label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const active = segment === key;
    return (
      <FocusablePressable
        onPress={() => {
          tapFeedback();
          setSegment(key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={[s.segBtn, active && [s.segBtnActive, shadow.card]]}
      >
        <Ionicons name={icon} size={15} color={active ? colors.text : colors.secondaryText} />
        <Text style={[s.segText, active && s.segTextActive]}>{label}</Text>
      </FocusablePressable>
    );
  };

  const header = (
    <View style={{ width: contentW, alignSelf: "center" }}>
      <View style={s.segment} accessibilityRole="tablist">
        {segmentBtn("chapters", "Capitoli", "albums-outline")}
        {segmentBtn("timeline", "Timeline", "time-outline")}
      </View>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.sm }]}>
      <ScreenHeader
        title="Ricordi"
        subtitle={`${visibleMemories.length} capitoli · ${photos.length} foto`}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            {mode === "demo" && <DemoBadge />}
            <SettingsButton />
          </View>
        }
      />
      {header}

      {segment === "timeline" ? (
        <TimelineView photos={timelinePhotos} bottomPad={bottomPad} onOpenPhoto={(id) => navigation.navigate("PhotoDetail", { photoId: id })} />
      ) : (
        <FlatList
          data={visibleMemories}
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg, paddingBottom: bottomPad, width: contentW, alignSelf: "center" }}
          ListHeaderComponent={
            <FocusablePressable
              style={({ pressed }) => [s.passport, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
              onPress={() => navigation.navigate("Passport")}
              accessibilityRole="button"
              accessibilityLabel={`Passaporto dei luoghi, ${confirmedCount} timbri`}
            >
              <LinearGradient colors={[colors.accent, "#0E3F63"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.passportGrad}>
                <View style={{ flex: 1 }}>
                  <Text style={s.passportLabel}>PASSAPORTO DEI LUOGHI</Text>
                  <Text style={s.passportBig}>
                    {confirmedCount} <Text style={s.passportBigUnit}>{confirmedCount === 1 ? "timbro" : "timbri"}</Text>
                  </Text>
                  <Text style={s.passportMeta}>
                    {cityCount > 0 ? `${cityCount} ${cityCount === 1 ? "città riconosciuta" : "città riconosciute"} nei tuoi ricordi` : "Conferma un ricordo per ottenere il primo timbro"}
                  </Text>
                </View>
                <View style={s.passportIcon}>
                  <Ionicons name="ribbon" size={26} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </FocusablePressable>
          }
          ListEmptyComponent={
            <View style={{ minHeight: 320 }}>
              <EmptyState icon="albums-outline" title="Ancora nessun ricordo" message="Dopo la scansione, Atlante raggruppa le foto vicine nel tempo e nello spazio in capitoli che puoi confermare." />
            </View>
          }
          renderItem={({ item, index }) => {
            const cover = item.coverPhotoId ? photoById[item.coverPhotoId] : null;
            const start = item.periodStart ? new Date(item.periodStart) : null;
            const end = item.periodEnd ? new Date(item.periodEnd) : null;
            const periodLabel = start ? (end && fmt(end) !== fmt(start) ? `${fmt(start)} – ${fmt(end)}` : fmt(start)) : "";
            const hero = index === 0;
            return (
              <FocusablePressable
                style={({ pressed }) => [s.card, shadow.card, pressed && { transform: [{ scale: 0.985 }] }]}
                onPress={() => navigation.navigate("MemoryDetail", { memoryId: item.id })}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${periodLabel || "periodo sconosciuto"}, ${item.photoIds.length} foto`}
                accessibilityHint="Apre il dettaglio del ricordo"
              >
                <View style={[s.cover, { height: hero ? 320 : 210 }]}>
                  {cover ? (
                    <PhotoImage uri={cover.uri} style={StyleSheet.absoluteFill} transition={200} accessibilityLabel={`Copertina di ${item.title}`} showFailureLabel />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="images-outline" size={34} color={colors.mutedText} />
                    </View>
                  )}
                  <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.72)"]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
                  <View style={s.coverTop}>
                    <View style={s.chipOnPhoto}>
                      <Ionicons name={item.status === "confirmed" ? "checkmark-circle" : "sparkles"} size={12} color="#FFFFFF" />
                      <Text style={s.chipOnPhotoText}>{item.status === "confirmed" ? "Confermato" : "Suggerito"}</Text>
                    </View>
                    <View style={s.chipOnPhoto}>
                      <Ionicons name="images" size={12} color="#FFFFFF" />
                      <Text style={s.chipOnPhotoText}>{item.photoIds.length}</Text>
                    </View>
                  </View>
                  <View style={s.coverText}>
                    {item.placeName && !item.title.includes(item.placeName) ? (
                      <View style={s.placeRow}>
                        <Ionicons name="location" size={13} color="rgba(255,255,255,0.9)" />
                        <Text style={s.placeText}>{item.placeName}</Text>
                      </View>
                    ) : null}
                    <Text style={hero ? s.heroTitle : s.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {periodLabel ? <Text style={s.coverMeta}>{periodLabel}</Text> : null}
                  </View>
                </View>
              </FocusablePressable>
            );
          }}
        />
      )}
    </View>
  );
}

function fmt(d: Date) {
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    segment: { flexDirection: "row", marginHorizontal: spacing.lg, padding: 3, borderRadius: radius.md, backgroundColor: c.fill, marginBottom: spacing.sm },
    segBtn: { flex: 1, flexDirection: "row", gap: 6, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
    segBtnActive: { backgroundColor: c.surfaceElevated },
    segText: { ...type.subheadStrong, color: c.secondaryText },
    segTextActive: { color: c.text },
    passport: { borderRadius: radius.lg, overflow: "hidden" },
    passportGrad: { flexDirection: "row", alignItems: "center", padding: spacing.xl, gap: spacing.lg },
    passportLabel: { ...type.captionStrong, color: "rgba(255,255,255,0.8)", letterSpacing: 1.2 },
    passportBig: { ...type.largeTitle, color: "#FFFFFF", marginTop: 4 },
    passportBigUnit: { ...type.title3, color: "rgba(255,255,255,0.85)" },
    passportMeta: { ...type.footnote, color: "rgba(255,255,255,0.85)", marginTop: 2 },
    passportIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
    card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.fill },
    cover: { width: "100%", justifyContent: "space-between", backgroundColor: c.fill },
    coverTop: { flexDirection: "row", justifyContent: "space-between", padding: spacing.md },
    coverText: { padding: spacing.lg, gap: 2 },
    chipOnPhoto: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.35)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
    },
    chipOnPhotoText: { ...type.captionStrong, color: "#FFFFFF" },
    placeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    placeText: { ...type.footnoteStrong, color: "rgba(255,255,255,0.92)", textTransform: "uppercase", letterSpacing: 0.8 },
    heroTitle: { ...type.title1, color: "#FFFFFF" },
    cardTitle: { ...type.title2, color: "#FFFFFF" },
    coverMeta: { ...type.footnote, color: "rgba(255,255,255,0.85)" },
  });
