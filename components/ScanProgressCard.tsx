import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FocusablePressable from "./FocusablePressable";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { IndexJobStatus } from "../lib/types";
import { BackgroundScanAvailability } from "../lib/indexing/backgroundScan";

interface Props {
  status: IndexJobStatus;
  /** Only meaningful for a real-library scan on iOS; omit for the demo. */
  background?: BackgroundScanAvailability | null;
  onPause: () => void;
  onResume: () => void;
}

/** Live progress of the library scan, plus the explicit resume path after a pause,
 * an app restart or an OTA reload. The numbers are the persisted checkpoint, so a
 * resumed scan visibly continues from where it stopped. */
export function ScanProgressCard({ status, onPause, onResume, background = null }: Props) {
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const scanning = status.phase === "scanning";
  const resumable =
    (status.phase === "paused" || status.phase === "cancelled") && status.cursor != null;
  if (!scanning && !resumable) return null;

  const total = status.total != null && status.total > 0 ? status.total : null;
  const scanned = total != null ? Math.min(status.scanned, total) : status.scanned;
  const pct = total != null ? Math.round((scanned / total) * 100) : null;
  const counter = total != null ? `${scanned.toLocaleString("it-IT")} di ${total.toLocaleString("it-IT")}` : `${scanned.toLocaleString("it-IT")} foto`;

  return (
    <View style={[s.card, shadow.card]} accessibilityLiveRegion="polite">
      <View style={s.row}>
        {scanning ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons name="pause-circle" size={20} color={colors.warn} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{scanning ? "Lettura della libreria" : "Scansione in pausa"}</Text>
          <Text style={s.body}>
            {counter}
            {pct != null ? ` · ${pct}%` : ""}
            {scanning ? "" : " · riprende da qui"}
          </Text>
        </View>
        <FocusablePressable
          onPress={scanning ? onPause : onResume}
          accessibilityRole="button"
          accessibilityLabel={scanning ? "Metti in pausa la scansione" : "Riprendi la scansione da dove si era fermata"}
          style={({ pressed }) => [scanning ? s.ghostButton : s.pillButton, pressed && { opacity: 0.7 }]}
        >
          <Text style={scanning ? s.ghostText : s.pillText}>{scanning ? "Pausa" : "Riprendi"}</Text>
        </FocusablePressable>
      </View>
      {pct != null && (
        <View style={s.track}>
          <View style={[s.fill, { width: `${pct}%` }]} />
        </View>
      )}
      {scanning && background != null && (
        <View style={s.bgRow}>
          <Ionicons
            name={background === "available" ? "moon-outline" : "phone-portrait-outline"}
            size={14}
            color={colors.secondaryText}
          />
          <Text style={s.bgText}>
            {background === "available"
              ? "Se esci dall'app, iOS la fa proseguire a piccoli passi quando lo ritiene opportuno."
              : background === "unavailable"
                ? "Tieni l'app aperta: la scansione avanza solo in primo piano."
                : "Aggiornamento app in background disattivato: tieni l'app aperta o attivalo in Impostazioni iOS."}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      gap: spacing.sm,
    },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    title: { ...type.footnoteStrong, color: c.text },
    body: { ...type.caption, color: c.secondaryText, marginTop: 1 },
    bgRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
    bgText: { ...type.caption, color: c.secondaryText, flex: 1 },
    track: { height: 4, borderRadius: 2, backgroundColor: c.fill, overflow: "hidden" },
    fill: { height: 4, borderRadius: 2, backgroundColor: c.accent },
    pillButton: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
    },
    pillText: { ...type.footnoteStrong, color: c.onAccent },
    ghostButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
    ghostText: { ...type.footnoteStrong, color: c.accent },
  });
