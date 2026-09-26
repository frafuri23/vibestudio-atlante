import React, { useEffect, useMemo, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { useReduceMotion } from "../lib/useReduceMotion";
import FocusablePressable from "../components/FocusablePressable";
import { Image } from "expo-image";

const ASSET = "https://appspawn-gateway-production.up.railway.app/v1/assets/fe29a326-def4-5c43-a6aa-328450620f9b/";
// Decorative illustration only (never presented as the user's own photos).
const COLLAGE = [
  { uri: ASSET + "demo-lisbona-1.png", label: "Lisbona", rotate: "-8deg", x: -96, y: 18 },
  { uri: ASSET + "demo-fiji.png", label: "Figi", rotate: "7deg", x: 96, y: 22 },
  { uri: ASSET + "demo-roma-1.png", label: "Roma", rotate: "-1deg", x: 0, y: 0 },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Wide + short windows (desktop, iPad landscape): two columns so both actions stay
  // above the fold. Short phones: a smaller collage.
  const wide = width >= 900;
  const compact = height < 740;
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { startDemo, requestRealAccess, completeOnboarding } = useAppState();
  const reduceMotion = useReduceMotion();

  // Entrance: fade + 12px rise. The resting style is already fully visible, so the
  // screen is never blank if the animation doesn't run.
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      appear.setValue(1);
      return;
    }
    appear.setValue(0);
    const animation = Animated.timing(appear, { toValue: 1, duration: 320, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [appear, reduceMotion]);
  const animatedStyle = {
    opacity: appear.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  // Universal target: on tablet/desktop widths the column is centred and capped so
  // the copy and buttons don't stretch across the whole window.
  const columnStyle = wide
    ? { width: "100%" as const, maxWidth: 1000, alignSelf: "center" as const, flexDirection: "row" as const, alignItems: "center" as const, gap: 56 }
    : { width: "100%" as const, maxWidth: width >= 700 ? 520 : undefined, alignSelf: "center" as const };
  const collageScale = wide ? 1.35 : compact ? 0.82 : 1;

  const choose = async (which: "demo" | "real") => {
    try {
      if (which === "demo") await startDemo();
      else await requestRealAccess();
      await completeOnboarding();
    } catch (e) {
      console.error("[Atlante] onboarding choose failed", e);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[columnStyle, animatedStyle]}>
          <View
            style={[s.collage, wide ? { flex: 1, height: 320, marginBottom: 0 } : compact ? { height: 170, marginBottom: spacing.lg } : null, { transform: [{ scale: collageScale }] }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {COLLAGE.map((c) => (
              <View key={c.label} style={[s.polaroid, shadow.raised, { transform: [{ translateX: c.x }, { translateY: c.y }, { rotate: c.rotate }] }]}>
                <Image source={{ uri: c.uri }} style={s.polaroidImg} contentFit="cover" transition={200} />
                <View style={s.polaroidLabel}>
                  <Ionicons name="location" size={11} color={colors.accent} />
                  <Text style={s.polaroidText}>{c.label}</Text>
                </View>
              </View>
            ))}
            <View style={[s.mark, shadow.raised]}>
              <Ionicons name="compass" size={26} color={colors.onAccent} />
            </View>
          </View>
          <View style={wide ? { flex: 1, maxWidth: 460 } : null}>
          <Text style={s.brand}>ATLANTE</Text>
          <Text style={s.headline}>La tua vita ha già{"\n"}una mappa.</Text>
          <Text style={s.deck}>Scoprila nelle tue foto: luoghi, capitoli e ricordi, costruiti sul dispositivo.</Text>

          <View style={[s.noticeCard, shadow.card]}>
            <View style={s.noticeIcon}>
              <Ionicons name="lock-closed" size={15} color={colors.accent} />
            </View>
            <Text style={s.noticeText}>
              Le foto autorizzate vengono organizzate sul dispositivo. Nessuna immagine viene caricata sui nostri server
              senza una tua azione esplicita di condivisione. Mappe e servizi Apple possono utilizzare Internet.
            </Text>
          </View>

          <View style={{ height: compact ? spacing.lg : spacing.xl }} />

          <FocusablePressable
            onPress={() => choose("real")}
            accessibilityRole="button"
            accessibilityLabel="Usa le mie foto"
            accessibilityHint="Richiede il permesso per leggere le foto che autorizzi"
            style={({ pressed }) => [s.primaryButton, shadow.card, pressed && s.pressedPrimary]}
          >
            <Ionicons name="images" size={18} color={colors.onAccent} />
            <Text style={s.primaryButtonText}>Usa le mie foto</Text>
          </FocusablePressable>
          <FocusablePressable
            onPress={() => choose("demo")}
            accessibilityRole="button"
            accessibilityLabel="Esplora una demo"
            accessibilityHint="Apre Atlante con fotografie dimostrative separate dalla tua libreria"
            style={({ pressed }) => [s.secondaryButton, pressed && s.pressedSecondary]}
          >
            <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
            <Text style={s.secondaryButtonText}>Esplora una demo</Text>
          </FocusablePressable>

          <Text style={s.footnote}>Nessun account, nessun pagamento e nessuna posizione attuale richiesti per iniziare.</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background, paddingHorizontal: spacing.xl },
    scroll: { flexGrow: 1, justifyContent: "center", paddingBottom: spacing.lg },
    collage: { height: 200, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
    polaroid: { position: "absolute", width: 132, padding: 6, paddingBottom: 8, borderRadius: 14, backgroundColor: c.surfaceElevated },
    polaroidImg: { width: "100%", height: 120, borderRadius: 9, backgroundColor: c.fill },
    polaroidLabel: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6, paddingHorizontal: 2 },
    polaroidText: { ...type.captionStrong, color: c.text },
    mark: {
      position: "absolute",
      bottom: -14,
      right: "22%",
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: c.background,
    },
    brand: { ...type.captionStrong, color: c.accent, letterSpacing: 1.6, marginBottom: spacing.xs },
    headline: { ...type.largeTitle, fontSize: 38, lineHeight: 44, color: c.text },
    deck: { ...type.body, color: c.secondaryText, marginTop: spacing.sm, marginBottom: spacing.xl },
    noticeCard: {
      flexDirection: "row",
      gap: spacing.md,
      alignItems: "flex-start",
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    noticeIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    noticeText: { ...type.footnote, color: c.secondaryText, flex: 1 },
    primaryButton: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      minHeight: 52,
      marginBottom: spacing.md,
    },
    pressedPrimary: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    primaryButtonText: { ...type.headline, fontSize: 17, color: c.onAccent },
    secondaryButton: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accentSoft,
      borderRadius: radius.pill,
      minHeight: 52,
    },
    pressedSecondary: { opacity: 0.7 },
    secondaryButtonText: { ...type.headline, fontSize: 17, color: c.accent },
    footnote: { ...type.caption, color: c.mutedText, textAlign: "center", marginTop: spacing.xl },
  });
