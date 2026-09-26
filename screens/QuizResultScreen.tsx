import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { useReduceMotion } from "../lib/useReduceMotion";

export default function QuizResultScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { photos } = useAppState();
  const reduceMotion = useReduceMotion();
  const { points = 0, maxPoints = 0, coverPhotoId } = route.params ?? {};
  const cover = photos.find((p) => p.id === coverPhotoId);
  const ratio = maxPoints > 0 ? Math.max(0, Math.min(1, points / maxPoints)) : 0;

  // The score bar fills on entry. Its resting width is the real value, so the bar is
  // still correct if the animation never runs.
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      fill.setValue(1);
      return;
    }
    fill.setValue(0);
    const animation = Animated.timing(fill, { toValue: 1, duration: 520, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [fill, reduceMotion]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.round(ratio * 100)}%`] });

  return (
    // SafeAreaView (frame-aware): protects the top inset if this screen is ever shown
    // without a navigation bar, and resolves to 0 padding under the native header.
    <SafeAreaView style={[s.root, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} edges={["top"]}>
      <View style={s.center}>
        {cover && <Image source={{ uri: cover.uri }} style={[s.cover, shadow.raised]} contentFit="cover" />}
        <Text style={s.label}>PUNTEGGIO</Text>
        <Text style={s.score}>{points}</Text>
        <Text style={s.max}>su {maxPoints} punti</Text>

        <View
          style={s.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Punteggio quiz"
          accessibilityValue={{ min: 0, max: maxPoints, now: points, text: `${points} su ${maxPoints} punti` }}
        >
          <Animated.View style={[s.trackFill, { width }]} />
        </View>

        <Text style={s.subtitle}>Nessuna classifica pubblica: è un gioco personale con i tuoi ricordi.</Text>
      </View>

      <View style={s.actions}>
        <Pressable
          style={({ pressed }) => [s.primaryButton, shadow.card, pressed && { opacity: 0.85 }]}
          onPress={() => navigation.navigate("ShareCard", { kind: "quiz", points, maxPoints, coverPhotoId })}
          accessibilityRole="button"
        >
          <Text style={s.primaryButtonText}>Crea card del risultato</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.secondaryButton, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate("Tabs", { screen: "QuizTab" })}
          accessibilityRole="button"
        >
          <Text style={s.secondaryButtonText}>Nuova partita</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background, paddingHorizontal: spacing.xl },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    cover: { width: 152, height: 152, borderRadius: radius.lg, backgroundColor: c.fill, marginBottom: spacing.xl },
    label: { ...type.captionStrong, color: c.mutedText, letterSpacing: 1.2 },
    score: { ...type.largeTitle, fontSize: 64, lineHeight: 70, color: c.accent },
    max: { ...type.subhead, color: c.secondaryText },
    track: {
      width: "100%",
      maxWidth: 320,
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: c.fill,
      overflow: "hidden",
      marginTop: spacing.xl,
    },
    trackFill: { height: "100%", borderRadius: radius.pill, backgroundColor: c.accent },
    subtitle: { ...type.footnote, color: c.secondaryText, textAlign: "center", marginTop: spacing.lg, maxWidth: 320 },
    actions: { width: "100%", gap: spacing.sm },
    primaryButton: {
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { ...type.headline, color: c.onAccent },
    secondaryButton: {
      backgroundColor: c.surface,
      borderRadius: radius.pill,
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: { ...type.headline, color: c.text },
  });
