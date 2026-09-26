import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { sanitizeForTravelCard, sanitizeForQuizResultCard } from "../lib/share/sanitizer";
import { ShareDraftRecord } from "../lib/types";
import { LinearGradient } from "expo-linear-gradient";
import { nearestCity } from "../lib/geo/cityIndex";

let ViewShot: any = null;
let Sharing: any = null;
if (Platform.OS !== "web") {
  ViewShot = require("react-native-view-shot").default;
  Sharing = require("expo-sharing");
}

export default function ShareCardScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { photos, overrides, memories, privateZones, saveShareDraft } = useAppState();
  const kind: "travel" | "quiz" = route.params?.kind === "quiz" ? "quiz" : "travel";
  const viewShotRef = useRef<any>(null);
  // "sheetClosed": on iOS expo-sharing resolves when the share sheet is dismissed
  // WITHOUT saying whether something was actually shared, so the app can never
  // honestly claim "Condiviso" — it only knows the file was created and the sheet closed.
  const [status, setStatus] = useState<"idle" | "capturing" | "error" | "sheetClosed" | "cancelled">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const draftIdRef = useRef<string>(`draft-${Date.now()}`);

  const model = useMemo(() => {
    if (kind === "quiz") {
      const cover = photos.find((p) => p.id === route.params?.coverPhotoId) ?? null;
      const quizModel = sanitizeForQuizResultCard(route.params?.points ?? 0, route.params?.maxPoints ?? 0, cover, overrides);
      return { kind: "quiz" as const, ...quizModel };
    }
    const memoryId = route.params?.memoryId;
    const memory = memories.find((m) => m.id === memoryId);
    const selected = memory ? photos.filter((p) => memory.photoIds.includes(p.id)).slice(0, 6) : photos.slice(0, 6);
    // Private zones are applied here BEFORE any bounds/rendering math, per plan §10 —
    // never after the card's layout is already computed.
    // Only a coarse city label and a month-level period ever reach the card.
    const placeNames: Record<string, string | null> = {};
    selected.forEach((p) => {
      placeNames[p.id] = nearestCity(p.latitude, p.longitude)?.name ?? null;
    });
    const period = memory?.periodStart
      ? new Date(memory.periodStart).toLocaleDateString("it-IT", { month: "long", year: "numeric" })
      : null;
    const draftModel = sanitizeForTravelCard(memory?.title ?? "Il mio viaggio", period, selected, overrides, placeNames, privateZones);
    // If private zones removed photos, an auto-generated title could still name the
    // hidden place: fall back to a neutral title unless the user wrote it.
    const title = draftModel.stops.length < selected.length && !memory?.userEdited ? "Il mio viaggio" : draftModel.title;
    return { kind: "travel" as const, ...draftModel, title };
  }, [kind, photos, overrides, memories, privateZones, route.params]);

  // share_drafts (plan §3): a draft is recorded the moment the card is composed, and
  // flipped to "approved" only once a real share actually succeeds — never before.
  useEffect(() => {
    const selectedIds = kind === "quiz" ? (route.params?.coverPhotoId ? [route.params.coverPhotoId] : []) : (model as any).stops?.map((s2: any) => s2.photoId) ?? [];
    const draft: ShareDraftRecord = {
      id: draftIdRef.current,
      format: kind === "quiz" ? "quizResult" : "travel",
      selectedPhotoIds: selectedIds,
      precisionSettings: { preciseDate: false, preciseLocation: false },
      title: kind === "quiz" ? "Quanto ricordi?" : (model as any).title ?? "Il mio viaggio",
      status: "draft",
      approvedRevision: null,
    };
    saveShareDraft(draft).catch(() => {});
  }, [model, kind]);

  const doShare = async () => {
    if (Platform.OS === "web" || !ViewShot || !Sharing) {
      setStatus("error");
      setErrorText("L'esportazione di un file reale richiede una build nativa: nell'anteprima web non è disponibile.");
      return;
    }
    setStatus("capturing");
    setErrorText(null);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setStatus("error");
        setErrorText("La condivisione non è disponibile su questo dispositivo.");
        return;
      }
      const uri: string = await viewShotRef.current.capture();
      // The user explicitly approved THIS revision by tapping Condividi and a real file
      // now exists: that is what "approved" records — not that a recipient received it.
      await saveShareDraft({
        id: draftIdRef.current,
        format: kind === "quiz" ? "quizResult" : "travel",
        selectedPhotoIds: kind === "quiz" ? (route.params?.coverPhotoId ? [route.params.coverPhotoId] : []) : (model as any).stops?.map((s2: any) => s2.photoId) ?? [],
        precisionSettings: { preciseDate: false, preciseLocation: false },
        title: kind === "quiz" ? "Quanto ricordi?" : (model as any).title ?? "Il mio viaggio",
        status: "approved",
        approvedRevision: Date.now(),
      }).catch(() => {});
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Condividi la card" });
      setStatus("sheetClosed");
    } catch (e: any) {
      // Never report "shared" unless shareAsync genuinely resolved — a cancel from
      // the share sheet must not be reported as success.
      if (String(e?.message ?? "").toLowerCase().includes("cancel")) {
        setStatus("cancelled");
      } else {
        setStatus("error");
        setErrorText(e?.message ?? "Errore durante l'esportazione.");
      }
    }
  };

  return (
    // SafeAreaView (frame-aware) protects the top inset when this screen is shown
    // without a navigation bar; under the native header its padding resolves to 0,
    // so the content is never double-inset.
    <SafeAreaView style={s.safe} edges={["top"]}>
    <ScrollView
      style={s.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg }]}
    >
      <Text style={s.title}>{kind === "quiz" ? "Quanto ricordi?" : "Card di viaggio"}</Text>
      <Text style={s.caption}>Anteprima della card. Nessun dato viene condiviso finché non lo fai tu.</Text>

      <CardPreview ref={viewShotRef} model={model as any} s={s} shadowStyle={shadow.raised} />

      {status === "error" && errorText ? (
        <View style={s.statusRow}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[s.statusText, { color: colors.danger }]}>{errorText}</Text>
        </View>
      ) : null}
      {status === "cancelled" ? (
        <View style={s.statusRow}>
          <Ionicons name="close-circle-outline" size={16} color={colors.secondaryText} />
          <Text style={[s.statusText, { color: colors.secondaryText }]}>Condivisione annullata.</Text>
        </View>
      ) : null}
      {status === "sheetClosed" ? (
        <View style={s.statusRow}>
          <Ionicons name="document-outline" size={16} color={colors.secondaryText} />
          <Text style={[s.statusText, { color: colors.secondaryText }]}>
            Card creata come immagine. iOS non comunica se l'hai inviata o se hai chiuso il foglio di condivisione.
          </Text>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [s.shareButton, shadow.card, pressed && { opacity: 0.85 }]}
        onPress={doShare}
        disabled={status === "capturing"}
        accessibilityRole="button"
      >
        <Ionicons name="share-outline" size={18} color={colors.onAccent} />
        <Text style={s.shareButtonText}>{status === "capturing" ? "Preparazione…" : "Condividi"}</Text>
      </Pressable>

      {Platform.OS === "web" && (
        <Text style={s.footnote}>L'anteprima qui è fedele al layout; il file scaricabile reale si genera su build iOS.</Text>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

const CardPreview = React.forwardRef(function CardPreview(
  { model, s, shadowStyle }: { model: any; s: any; shadowStyle: any },
  ref: any,
) {
  const Wrapper = Platform.OS !== "web" ? ViewShot : View;
  return (
    <Wrapper ref={ref} style={[s.card, shadowStyle]} options={{ format: "png", quality: 0.92 }}>
      {model.kind === "quiz" ? (
        <View style={s.quizCard}>
          {model.coverUri && <Image source={{ uri: model.coverUri }} style={s.quizCover} contentFit="cover" />}
          <Text style={s.quizLabel}>QUANTO RICORDI?</Text>
          <Text style={s.quizScore}>{model.scoreLabel}</Text>
          <View style={{ flex: 1 }} />
          <Text style={s.brand}>ATLANTE</Text>
        </View>
      ) : (
        <View style={s.travelCard}>
          {model.stops.length > 0 ? (
            <Image source={{ uri: model.stops[0].uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <LinearGradient colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
          <Text style={s.brandOnPhoto}>ATLANTE</Text>
          <View style={{ flex: 1 }} />
          <View style={s.travelBody}>
            {(() => {
              const labels = Array.from(new Set(model.stops.map((st: any) => st.approxLabel).filter(Boolean))) as string[];
              return labels.length ? <Text style={s.travelPlaces}>{labels.slice(0, 3).join(" · ").toUpperCase()}</Text> : null;
            })()}
            <Text style={s.travelTitle}>{model.title}</Text>
            {model.periodLabel ? <Text style={s.travelPeriod}>{model.periodLabel}</Text> : null}
            {model.stops.length > 1 && (
              <View style={s.stopsRow}>
                {model.stops.slice(1, 5).map((stop: any) => (
                  <Image key={stop.photoId} source={{ uri: stop.uri }} style={s.stopImage} contentFit="cover" />
                ))}
              </View>
            )}
            {model.stops.length === 0 && <Text style={s.travelPeriod}>Nessuna foto condivisibile (zone private o esclusioni).</Text>}
          </View>
        </View>
      )}
    </Wrapper>
  );
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: spacing.lg, alignItems: "center" },
    title: { ...type.title1, color: c.text, alignSelf: "flex-start" },
    caption: { ...type.footnote, color: c.secondaryText, alignSelf: "flex-start", marginTop: 2 },
    card: {
      width: 280,
      aspectRatio: 9 / 16,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      marginTop: spacing.xl,
      overflow: "hidden",
    },
    quizCard: { flex: 1, alignItems: "center", padding: spacing.xl, gap: spacing.sm },
    quizCover: { width: 132, height: 132, borderRadius: radius.md, backgroundColor: c.fill, marginBottom: spacing.md },
    quizLabel: { ...type.captionStrong, color: c.mutedText, letterSpacing: 1.2 },
    quizScore: { ...type.largeTitle, fontSize: 40, lineHeight: 46, color: c.accent },
    travelCard: { flex: 1, backgroundColor: "#1B2A36" },
    brandOnPhoto: { ...type.captionStrong, color: "rgba(255,255,255,0.9)", letterSpacing: 2, padding: spacing.lg },
    travelBody: { padding: spacing.lg, gap: 4 },
    travelPlaces: { ...type.captionStrong, color: "rgba(255,255,255,0.85)", letterSpacing: 1.2 },
    travelTitle: { ...type.title1, color: "#FFFFFF" },
    travelPeriod: { ...type.footnote, color: "rgba(255,255,255,0.85)" },
    stopsRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
    stopImage: { width: 52, height: 52, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", backgroundColor: c.fill },
    brand: { ...type.captionStrong, color: c.mutedText, letterSpacing: 1.6, alignSelf: "center" },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, maxWidth: 300 },
    statusText: { ...type.footnote, flex: 1 },
    shareButton: {
      flexDirection: "row",
      gap: spacing.sm,
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xxl,
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.xl,
      alignSelf: "stretch",
    },
    shareButtonText: { ...type.headline, color: c.onAccent },
    footnote: { ...type.caption, color: c.mutedText, textAlign: "center", marginTop: spacing.md, maxWidth: 300 },
  });
