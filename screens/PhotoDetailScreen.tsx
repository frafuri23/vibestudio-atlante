import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { PhotoImage } from "../components/PhotoImage";
import type { PhotoAsset } from "../lib/types";

const SUBTYPE_LABEL: Record<PhotoAsset["mediaSubtype"], string> = {
  photo: "Foto",
  screenshot: "Screenshot",
  livePhotoStill: "Live Photo (fotogramma)",
  panorama: "Panorama",
};

const CLOUD_LABEL: Record<PhotoAsset["cloudAvailability"], string> = {
  local: "Sul dispositivo",
  cloud_pending: "Solo su iCloud",
  unknown: "Non determinata",
};

/** Keep the photo's own ratio, clamped so a panorama or a very tall screenshot
 * never becomes a sliver or pushes the details off screen. */
function displayRatio(p: PhotoAsset): number {
  const r = p.width > 0 && p.height > 0 ? p.width / p.height : 4 / 3;
  return Math.min(2.2, Math.max(0.75, r));
}
import { useRoute } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { hairline, Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { isValidCoordinate } from "../lib/geo/haversine";
import { resolveNearbyPlace, makeManualPlace } from "../lib/geo/placeResolver";

export default function PhotoDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { photos, overrides, setOverride, places, upsertPlace } = useAppState();
  const photo = useMemo(() => photos.find((p) => p.id === route.params?.photoId) ?? null, [photos, route.params]);
  const ov = photo ? overrides[photo.id] : undefined;
  const [saving, setSaving] = useState(false);
  const [namingPlace, setNamingPlace] = useState(false);
  const [placeNameInput, setPlaceNameInput] = useState("");

  if (!photo) {
    // The navigation header already insets the top, so only the bottom is padded here.
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <Text style={s.notFound}>Foto non trovata (potrebbe non essere più autorizzata).</Text>
      </SafeAreaView>
    );
  }

  const lat = ov?.manualLatitude ?? photo.latitude;
  const lon = ov?.manualLongitude ?? photo.longitude;
  const hasLocation = isValidCoordinate(lat, lon);
  const locationSource = ov?.manualLatitude != null ? "Corretta manualmente" : hasLocation ? "Dai metadati originali" : "Nessuna posizione";
  const dateLabel = photo.createdAt ? new Date(ov?.manualDate ?? photo.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "Data sconosciuta";

  // No network geocoder is wired in this release (plan §7): resolution only looks at
  // places already named locally. If none matches, the honest state is "Luogo da
  // nominare" plus a manual-naming affordance — never an invented city name.
  const resolvedPlace = hasLocation ? resolveNearbyPlace(lat as number, lon as number, places) : null;

  const toggle = async (key: "excludeFromApp" | "excludeFromQuiz" | "excludeFromSharing" | "favoriteLocal") => {
    setSaving(true);
    try {
      await setOverride({
        photoId: photo.id,
        manualLatitude: ov?.manualLatitude ?? null,
        manualLongitude: ov?.manualLongitude ?? null,
        manualDate: ov?.manualDate ?? null,
        excludeFromApp: ov?.excludeFromApp ?? false,
        excludeFromQuiz: ov?.excludeFromQuiz ?? false,
        excludeFromSharing: ov?.excludeFromSharing ?? false,
        favoriteLocal: ov?.favoriteLocal ?? false,
        [key]: !(ov?.[key] ?? false),
      });
    } finally {
      setSaving(false);
    }
  };

  const saveManualPlaceName = async () => {
    if (!hasLocation || !placeNameInput.trim()) return;
    await upsertPlace(makeManualPlace(`place-${photo.id}`, lat as number, lon as number, placeNameInput));
    setNamingPlace(false);
  };

  return (
    // SafeAreaView (frame-aware) protects the top inset when no navigation bar is
    // shown; under the native header it resolves to 0 and never double-insets.
    <SafeAreaView style={s.root} edges={["top"]}>
    <ScrollView
      style={s.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <PhotoImage
        uri={photo.uri}
        style={[s.image, { aspectRatio: displayRatio(photo) }]}
        accessibilityLabel={`Foto del ${dateLabel}`}
        showFailureLabel
      />
      {photo.metadataStatus === "unavailable" ? (
        <Text style={s.metaNote}>
          I metadati di questa foto non erano leggibili durante la scansione (spesso un originale non ancora scaricato da iCloud). Verranno ricontrollati alla prossima scansione.
        </Text>
      ) : null}

      <View style={s.body}>
        <Text style={s.dateTitle}>{dateLabel}</Text>

        <View style={[s.group, shadow.card]}>
          <Row label="Posizione" value={locationSource} s={s} />
          {hasLocation && (
            <View style={s.row}>
              <Text style={s.rowLabel}>Luogo</Text>
              {resolvedPlace?.name ? (
                <Text style={s.rowValue}>{resolvedPlace.name}</Text>
              ) : namingPlace ? (
                <View style={s.placeInputRow}>
                  <TextInput
                    style={s.placeInput}
                    value={placeNameInput}
                    onChangeText={setPlaceNameInput}
                    placeholder="Nome del luogo"
                    placeholderTextColor={colors.mutedText}
                    autoFocus
                  />
                  <Pressable
                    onPress={saveManualPlaceName}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Salva nome del luogo"
                    style={s.placeAction}
                  >
                    <Text style={s.placeSave}>Salva</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setNamingPlace(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Assegna un nome al luogo"
                  style={s.placeAction}
                >
                  <Text style={s.rowValueAction}>Luogo da nominare</Text>
                </Pressable>
              )}
            </View>
          )}
          <Row label="Tipo" value={SUBTYPE_LABEL[photo.mediaSubtype] ?? "Foto"} s={s} />
          <Row label="Disponibilità" value={photo.isDemo ? "Demo" : CLOUD_LABEL[photo.cloudAvailability] ?? "Non determinata"} s={s} last />
        </View>

        <Text style={s.groupHeader}>PREFERENZE SOLO IN ATLANTE</Text>
        <View style={[s.group, shadow.card]}>
          <ToggleRow label="Preferito" value={!!ov?.favoriteLocal} onChange={() => toggle("favoriteLocal")} disabled={saving} s={s} accent={colors.accent} />
          <ToggleRow label="Escludi da Atlante" value={!!ov?.excludeFromApp} onChange={() => toggle("excludeFromApp")} disabled={saving} s={s} accent={colors.accent} />
          <ToggleRow label="Escludi dai quiz" value={!!ov?.excludeFromQuiz} onChange={() => toggle("excludeFromQuiz")} disabled={saving} s={s} accent={colors.accent} />
          <ToggleRow label="Escludi dalle condivisioni" value={!!ov?.excludeFromSharing} onChange={() => toggle("excludeFromSharing")} disabled={saving} s={s} accent={colors.accent} last />
        </View>

        <Text style={s.footnote}>
          Queste scelte restano solo in Atlante: la foto originale nella tua libreria non viene modificata.
        </Text>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, s, last }: { label: string; value: string; s: any; last?: boolean }) {
  return (
    <View style={[s.row, last && s.rowLast]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
  s,
  accent,
  last,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
  disabled: boolean;
  s: any;
  accent: string;
  last?: boolean;
}) {
  return (
    <View style={[s.row, s.toggleRow, last && s.rowLast]}>
      <Text style={s.rowLabelStrong}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: accent }}
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    notFound: { ...type.body, color: c.secondaryText, padding: spacing.lg },
    image: { width: "100%", aspectRatio: 4 / 3 },
    metaNote: { ...type.footnote, color: c.warn, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    body: { padding: spacing.lg },
    dateTitle: { ...type.title1, color: c.text, marginBottom: spacing.lg },
    groupHeader: { ...type.captionStrong, color: c.mutedText, marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
    group: { backgroundColor: c.surface, borderRadius: radius.md, overflow: "hidden", paddingHorizontal: spacing.md },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      minHeight: 48,
      paddingVertical: spacing.sm,
      gap: spacing.md,
      borderBottomWidth: hairline,
      borderBottomColor: c.separator,
    },
    rowLast: { borderBottomWidth: 0 },
    toggleRow: { minHeight: 52 },
    rowLabel: { ...type.subhead, color: c.secondaryText },
    rowLabelStrong: { ...type.callout, color: c.text, flex: 1 },
    rowValue: { ...type.subheadStrong, color: c.text, flexShrink: 1, textAlign: "right" },
    rowValueAction: { ...type.subheadStrong, color: c.accent },
    placeInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    placeInput: {
      backgroundColor: c.fill,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      minHeight: 44,
      minWidth: 150,
      color: c.text,
      ...type.subhead,
    },
    placeAction: { minHeight: 44, justifyContent: "center" },
    placeSave: { ...type.subheadStrong, color: c.accent },
    footnote: { ...type.footnote, color: c.mutedText, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  });
