import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { hairline, Palette, radius, spacing, type } from "../lib/theme";
import { ThemePreference, useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import FocusablePressable from "../components/FocusablePressable";

const Pressable = FocusablePressable;

const APPEARANCE_OPTIONS: { key: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "system", label: "Sistema", icon: "phone-portrait-outline" },
  { key: "light", label: "Chiaro", icon: "sunny-outline" },
  { key: "dark", label: "Scuro", icon: "moon-outline" },
];

const MOTION_OPTIONS: { key: boolean | null; label: string }[] = [
  { key: null, label: "Sistema" },
  { key: true, label: "Attivo" },
  { key: false, label: "Disattivo" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, shadow, preference, setPreference } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const {
    mode,
    permission,
    repoBackend,
    indexStatus,
    rescan,
    requestRealAccess,
    wipeAppData,
    privateZones,
    addPrivateZone,
    removePrivateZone,
    appSettings,
    updateAppSettings,
  } = useAppState();
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [addingZone, setAddingZone] = useState(false);
  const [zoneLabel, setZoneLabel] = useState("");
  const [zoneLat, setZoneLat] = useState("");
  const [zoneLon, setZoneLon] = useState("");
  const [zoneRadius, setZoneRadius] = useState("300");
  const [zoneError, setZoneError] = useState<string | null>(null);

  const doWipe = async () => {
    setWiping(true);
    try {
      await wipeAppData();
      setConfirmingWipe(false);
    } finally {
      setWiping(false);
    }
  };

  const saveZone = async () => {
    const lat = parseFloat(zoneLat);
    const lon = parseFloat(zoneLon);
    const radiusMeters = parseFloat(zoneRadius);
    // Zones are configured manually only — the plan explicitly forbids inferring
    // "home"/"work" automatically, so there is no default value here to fall back on.
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180 ||
      Number.isNaN(radiusMeters) ||
      radiusMeters <= 0
    ) {
      setZoneError("Coordinate o raggio non validi.");
      return;
    }
    await addPrivateZone({
      id: `zone-${Date.now()}`,
      latitude: lat,
      longitude: lon,
      radiusMeters,
      scope: "whole_app",
      label: zoneLabel.trim() || null,
    });
    setZoneLabel("");
    setZoneLat("");
    setZoneLon("");
    setZoneRadius("300");
    setZoneError(null);
    setAddingZone(false);
  };

  return (
    // SafeAreaView (frame-aware) protects the top inset when this screen is shown
    // without a navigation bar; under the native header its padding resolves to 0,
    // so the content is never double-inset.
    <SafeAreaView style={s.safe} edges={["top"]}>
    <ScrollView
      style={s.root}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl, paddingHorizontal: spacing.lg }}
    >
      <Section title="Aspetto" s={s} shadowStyle={shadow.card}>
        <Text style={s.sectionNote}>Atlante segue Chiaro/Scuro di sistema, oppure puoi fissarne uno.</Text>
        <View style={s.segmented}>
          {APPEARANCE_OPTIONS.map((opt) => {
            const active = preference === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setPreference(opt.key)}
                accessibilityRole="button"
                accessibilityLabel={`Tema ${opt.label}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [s.segment, active && s.segmentActive, pressed && { opacity: 0.75 }]}
              >
                <Ionicons name={opt.icon} size={15} color={active ? colors.onAccent : colors.secondaryText} />
                <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Modalità e permessi" s={s} shadowStyle={shadow.card}>
        <InfoRow label="Modalità" value={mode === "demo" ? "Demo" : "Foto reali"} s={s} />
        <InfoRow label="Permesso libreria" value={permissionLabel(permission)} s={s} last={!(mode === "real" && permission !== "granted_full")} />
        {mode === "real" && permission !== "granted_full" && (
          <Pressable style={({ pressed }) => [s.actionButton, pressed && { opacity: 0.7 }]} onPress={requestRealAccess} accessibilityRole="button">
            <Text style={s.actionButtonText}>Aggiorna permesso</Text>
          </Pressable>
        )}
      </Section>

      <Section title="Indice locale" s={s} shadowStyle={shadow.card}>
        <InfoRow label="Motore di storage" value={repoBackend === "native_sqlite" ? "SQLite nativo" : "AsyncStorage (fallback web)"} s={s} />
        <InfoRow label="Stato scansione" value={indexStatus.phase} s={s} />
        <InfoRow label="Foto indicizzate" value={String(indexStatus.scanned)} s={s} last />
        <Pressable style={({ pressed }) => [s.actionButton, pressed && { opacity: 0.7 }]} onPress={rescan} accessibilityRole="button">
          <Text style={s.actionButtonText}>Aggiorna scansione</Text>
        </Pressable>
      </Section>

      <Section title="Zone private" s={s} shadowStyle={shadow.card}>
        <Text style={s.sectionNote}>
          Le foto dentro una zona privata sono escluse dalle card condivise (e, se scegli "tutta l'app", anche dalla
          mappa e dai ricordi). Nessuna zona viene dedotta automaticamente: la configuri tu.
        </Text>
        {privateZones.length === 0 && !addingZone && <Text style={s.emptyZones}>Nessuna zona configurata.</Text>}
        {privateZones.map((z) => (
          <View key={z.id} style={s.zoneRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabelStrong}>{z.label ?? "Zona senza nome"}</Text>
              <Text style={s.zoneMeta}>
                {z.latitude.toFixed(3)}, {z.longitude.toFixed(3)} · {z.radiusMeters} m ·{" "}
                {z.scope === "whole_app" ? "Tutta l'app" : "Solo condivisioni"}
              </Text>
            </View>
            <Pressable onPress={() => removePrivateZone(z.id)} hitSlop={10} accessibilityRole="button" style={s.iconButton}>
              <Ionicons name="trash-outline" size={19} color={colors.danger} />
            </Pressable>
          </View>
        ))}
        {addingZone ? (
          <View style={s.zoneForm}>
            <TextInput style={s.zoneInput} placeholder="Nome (opzionale)" placeholderTextColor={colors.mutedText} value={zoneLabel} onChangeText={setZoneLabel} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TextInput
                style={[s.zoneInput, { flex: 1 }]}
                placeholder="Latitudine"
                placeholderTextColor={colors.mutedText}
                keyboardType="numbers-and-punctuation"
                value={zoneLat}
                onChangeText={setZoneLat}
              />
              <TextInput
                style={[s.zoneInput, { flex: 1 }]}
                placeholder="Longitudine"
                placeholderTextColor={colors.mutedText}
                keyboardType="numbers-and-punctuation"
                value={zoneLon}
                onChangeText={setZoneLon}
              />
            </View>
            <TextInput
              style={s.zoneInput}
              placeholder="Raggio in metri"
              placeholderTextColor={colors.mutedText}
              keyboardType="numbers-and-punctuation"
              value={zoneRadius}
              onChangeText={setZoneRadius}
            />
            {zoneError && <Text style={s.zoneErrorText}>{zoneError}</Text>}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable style={({ pressed }) => [s.actionButton, { flex: 1 }, pressed && { opacity: 0.7 }]} onPress={saveZone} accessibilityRole="button">
                <Text style={s.actionButtonText}>Salva zona</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [s.actionButtonSecondary, pressed && { opacity: 0.7 }]} onPress={() => setAddingZone(false)} accessibilityRole="button">
                <Text style={s.actionButtonSecondaryText}>Annulla</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={({ pressed }) => [s.actionButton, pressed && { opacity: 0.7 }]} onPress={() => setAddingZone(true)} accessibilityRole="button">
            <Text style={s.actionButtonText}>Aggiungi zona privata</Text>
          </Pressable>
        )}
      </Section>

      <Section title="Accessibilità" s={s} shadowStyle={shadow.card}>
        <Text style={s.rowLabelStrong}>Riduci movimento</Text>
        <Text style={s.sectionNote}>Sistema segue l'impostazione del dispositivo; Attivo e Disattivo la sovrascrivono solo dentro Atlante.</Text>
        <View style={s.segmented} accessibilityRole="radiogroup" accessibilityLabel="Preferenza riduci movimento">
          {MOTION_OPTIONS.map((option) => {
            const active = appSettings.reduceMotionOverride === option.key;
            return (
              <Pressable
                key={option.label}
                onPress={() => updateAppSettings({ reduceMotionOverride: option.key })}
                accessibilityRole="radio"
                accessibilityLabel={`Riduci movimento: ${option.label}`}
                accessibilityState={{ checked: active, selected: active }}
                style={({ pressed }) => [s.segment, active && s.segmentActive, pressed && { opacity: 0.75 }]}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Diagnostica" s={s} shadowStyle={shadow.card}>
        <Pressable style={({ pressed }) => [s.navRow, pressed && { opacity: 0.6 }]} onPress={() => navigation.navigate("Diagnostic")} accessibilityRole="button">
          <Ionicons name="pulse" size={18} color={colors.accent} />
          <Text style={s.rowLabelNav}>Diagnostica M0 (capacità native)</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.mutedText} />
        </Pressable>
      </Section>

      <Section title="Dati" s={s} shadowStyle={shadow.card}>
        {!confirmingWipe ? (
          <Pressable style={({ pressed }) => [s.dangerButton, pressed && { opacity: 0.85 }]} onPress={() => setConfirmingWipe(true)} accessibilityRole="button">
            <Text style={s.dangerButtonText}>Cancella dati dell'app</Text>
          </Pressable>
        ) : (
          <View style={s.confirmBox}>
            <Text style={s.confirmText}>
              Questo cancella l'indice, i ricordi e le impostazioni salvate da Atlante su questo dispositivo. Non
              elimina le foto originali dalla tua libreria. Eventuali card già condivise fuori dall'app non possono
              essere richiamate.
            </Text>
            <Pressable style={({ pressed }) => [s.dangerButton, pressed && { opacity: 0.85 }]} onPress={doWipe} disabled={wiping} accessibilityRole="button">
              <Text style={s.dangerButtonText}>{wiping ? "Cancellazione…" : "Conferma cancellazione"}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [s.actionButtonSecondary, pressed && { opacity: 0.7 }]} onPress={() => setConfirmingWipe(false)} accessibilityRole="button">
              <Text style={s.actionButtonSecondaryText}>Annulla</Text>
            </Pressable>
          </View>
        )}
      </Section>
    </ScrollView>
    </SafeAreaView>
  );
}

function permissionLabel(p: string) {
  switch (p) {
    case "granted_full":
      return "Completo";
    case "granted_limited":
      return "Limitato";
    case "denied":
      return "Negato";
    case "unavailable_in_preview":
      return "Richiede build nativa";
    default:
      return "Sconosciuto";
  }
}

/** Declared at module level (never inside the screen) so the inputs it wraps keep
 * their focus between renders. */
function Section({ title, children, s, shadowStyle }: { title: string; children: React.ReactNode; s: any; shadowStyle: any }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={[s.sectionBody, shadowStyle]}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value, s, last }: { label: string; value: string; s: any; last?: boolean }) {
  return (
    <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    root: { flex: 1, backgroundColor: c.background },
    section: { marginTop: spacing.xl },
    sectionTitle: { ...type.captionStrong, color: c.mutedText, marginBottom: spacing.sm, marginLeft: spacing.xs },
    sectionBody: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
    sectionNote: { ...type.footnote, color: c.secondaryText },
    segmented: { flexDirection: "row", backgroundColor: c.fill, borderRadius: radius.sm, padding: 3, gap: 3 },
    segment: {
      flex: 1,
      flexDirection: "row",
      gap: 5,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      borderRadius: radius.sm - 2,
    },
    segmentActive: { backgroundColor: c.accent },
    segmentText: { ...type.footnoteStrong, color: c.secondaryText },
    segmentTextActive: { color: c.onAccent },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 40,
      paddingVertical: spacing.xs,
      borderBottomWidth: hairline,
      borderBottomColor: c.separator,
    },
    infoLabel: { ...type.subhead, color: c.secondaryText },
    infoValue: { ...type.subheadStrong, color: c.text, flexShrink: 1, textAlign: "right" },
    navRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
    rowLabelNav: { flex: 1, ...type.callout, color: c.text },
    rowLabelStrong: { ...type.subheadStrong, color: c.text },
    emptyZones: { ...type.subhead, color: c.mutedText },
    zoneRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      minHeight: 48,
      borderTopWidth: hairline,
      borderTopColor: c.separator,
    },
    iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    zoneMeta: { ...type.caption, color: c.mutedText, marginTop: 2 },
    zoneForm: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: hairline, borderTopColor: c.separator },
    zoneInput: {
      backgroundColor: c.fill,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      color: c.text,
      ...type.subhead,
    },
    zoneErrorText: { ...type.footnote, color: c.danger },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
    actionButton: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accentSoft,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
    },
    actionButtonText: { ...type.subheadStrong, color: c.accent },
    actionButtonSecondary: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
    actionButtonSecondaryText: { ...type.subheadStrong, color: c.secondaryText },
    dangerButton: { backgroundColor: c.danger, borderRadius: radius.sm, minHeight: 46, alignItems: "center", justifyContent: "center" },
    dangerButtonText: { ...type.subheadStrong, color: "#FFFFFF" },
    confirmBox: { gap: spacing.sm },
    confirmText: { ...type.footnote, color: c.secondaryText },
  });
