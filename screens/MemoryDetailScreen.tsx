import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { PhotoImage } from "../components/PhotoImage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import FocusablePressable from "../components/FocusablePressable";
import { hairline, Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { successFeedback, tapFeedback } from "../lib/haptics";

const GAP = 2;

export default function MemoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const { memories, photos, upsertMemory } = useAppState();
  const memory = useMemo(() => memories.find((m) => m.id === route.params?.memoryId), [memories, route.params]);
  const [title, setTitle] = useState(memory?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const memoryPhotos = useMemo(() => {
    if (!memory) return [];
    // Set lookup: includes() per photo was photos x chapter-size on a big library.
    const ids = new Set(memory.photoIds);
    return photos.filter((p) => ids.has(p.id)).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [memory, photos]);
  useEffect(() => {
    if (memory) setTitle(memory.title);
  }, [memory?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!memory) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <Text style={s.notFound}>Ricordo non trovato.</Text>
      </SafeAreaView>
    );
  }

  const contentW = Math.min(width, 900);
  const cols = contentW >= 700 ? 5 : 3;
  const tile = Math.floor((contentW - GAP * (cols - 1)) / cols);
  const cover = memoryPhotos.find((p) => p.id === memory.coverPhotoId) ?? memoryPhotos[0] ?? null;
  const start = memory.periodStart ? new Date(memory.periodStart) : null;
  const end = memory.periodEnd ? new Date(memory.periodEnd) : null;
  const fmt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const period = start ? (end && fmt(end) !== fmt(start) ? `${fmt(start)} – ${fmt(end)}` : fmt(start)) : "Data sconosciuta";

  const run = async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
    } catch (e: any) {
      setError(e?.message ?? "Salvataggio non riuscito.");
    }
  };
  const saveTitle = () =>
    run(async () => {
      if (title.trim() && title.trim() !== memory.title) await upsertMemory({ ...memory, title: title.trim(), userEdited: true });
    });
  const confirm = () =>
    run(async () => {
      await upsertMemory({ ...memory, title: title.trim() || memory.title, status: "confirmed", userEdited: true });
      successFeedback();
    });
  const dismiss = () =>
    run(async () => {
      await upsertMemory({ ...memory, status: "dismissed", userEdited: true });
      navigation.goBack();
    });

  const rows: (typeof memoryPhotos)[] = [];
  for (let i = 0; i < memoryPhotos.length; i += cols) rows.push(memoryPhotos.slice(i, i + cols));

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => `${i}-${r[0]?.id}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ width: contentW, alignSelf: "center", paddingBottom: insets.bottom + 150 }}
        ListHeaderComponent={
          <View>
            <View style={[s.hero, { height: Math.min(360, Math.round(contentW * 0.72)) }]}>
              {cover ? <PhotoImage uri={cover.uri} style={StyleSheet.absoluteFill} transition={200} showFailureLabel /> : null}
              <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
              <View style={s.heroText}>
                <View style={s.chipOnPhoto}>
                  <Ionicons name={memory.status === "confirmed" ? "checkmark-circle" : "sparkles"} size={12} color="#FFFFFF" />
                  <Text style={s.chipText}>{memory.status === "confirmed" ? "Confermato" : "Suggerito · modificabile"}</Text>
                </View>
                {memory.placeName ? (
                  <Text style={s.heroPlace}>
                    <Ionicons name="location" size={14} color="#FFFFFF" /> {memory.placeName}
                  </Text>
                ) : null}
                <Text style={s.heroMeta}>
                  {period} · {memoryPhotos.length} foto
                </Text>
              </View>
            </View>
            <View style={s.titleBox}>
              <Text style={s.label}>TITOLO</Text>
              <TextInput
                style={s.titleInput}
                value={title}
                onChangeText={setTitle}
                onBlur={saveTitle}
                onSubmitEditing={saveTitle}
                returnKeyType="done"
                placeholder="Titolo del ricordo"
                placeholderTextColor={colors.mutedText}
                accessibilityLabel="Titolo del ricordo"
              />
              {error ? <Text style={s.error}>{error}</Text> : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", gap: GAP, marginBottom: GAP }}>
            {item.map((p) => (
              <FocusablePressable
                key={p.id}
                onPress={() => navigation.navigate("PhotoDetail", { photoId: p.id })}
                accessibilityRole="button"
                accessibilityLabel="Apri foto"
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              >
                <PhotoImage uri={p.uri} style={{ width: tile, height: tile }} transition={120} />
              </FocusablePressable>
            ))}
          </View>
        )}
      />

      <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={s.actionsInner}>
          {memory.status !== "confirmed" ? (
            <FocusablePressable
              style={({ pressed }) => [s.primaryButton, shadow.card, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={confirm}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={18} color={colors.onAccent} />
              <Text style={s.primaryButtonText}>Conferma ricordo</Text>
            </FocusablePressable>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <FocusablePressable
              style={({ pressed }) => [s.secondaryButton, pressed && { opacity: 0.7 }]}
              onPress={() => {
                tapFeedback();
                navigation.navigate("ShareCard", { kind: "travel", memoryId: memory.id });
              }}
              accessibilityRole="button"
              accessibilityLabel="Crea una card di viaggio da condividere"
            >
              <Ionicons name="share-outline" size={17} color={colors.accent} />
              <Text style={[s.secondaryButtonText, { color: colors.accent }]}>Card di viaggio</Text>
            </FocusablePressable>
            <FocusablePressable
              style={({ pressed }) => [s.secondaryButton, pressed && { opacity: 0.7 }]}
              onPress={dismiss}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle-outline" size={17} color={colors.secondaryText} />
              <Text style={s.secondaryButtonText}>Scarta</Text>
            </FocusablePressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    notFound: { ...type.body, color: c.secondaryText, padding: spacing.lg },
    hero: { width: "100%", justifyContent: "flex-end", backgroundColor: c.fill },
    heroText: { padding: spacing.lg, gap: 4 },
    chipOnPhoto: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, marginBottom: 4 },
    chipText: { ...type.captionStrong, color: "#FFFFFF" },
    heroPlace: { ...type.title2, color: "#FFFFFF" },
    heroMeta: { ...type.subhead, color: "rgba(255,255,255,0.88)" },
    titleBox: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: 2 },
    label: { ...type.captionStrong, color: c.mutedText, letterSpacing: 1 },
    titleInput: { ...type.title1, color: c.text, paddingVertical: 4 },
    error: { ...type.footnote, color: c.danger },
    actions: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: spacing.md, backgroundColor: c.glass, borderTopWidth: hairline, borderTopColor: c.separator },
    actionsInner: { paddingHorizontal: spacing.lg, gap: spacing.sm, width: "100%", maxWidth: 720, alignSelf: "center" },
    primaryButton: { flexDirection: "row", gap: spacing.sm, backgroundColor: c.accent, borderRadius: radius.pill, minHeight: 50, alignItems: "center", justifyContent: "center" },
    primaryButtonText: { ...type.headline, color: c.onAccent },
    secondaryButton: { flex: 1, flexDirection: "row", gap: 6, backgroundColor: c.surface, borderRadius: radius.pill, minHeight: 48, alignItems: "center", justifyContent: "center" },
    secondaryButtonText: { ...type.subheadStrong, color: c.secondaryText },
  });
