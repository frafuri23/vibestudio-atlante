import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PermissionState } from "../lib/types";
import { radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";

const COPY: Record<PermissionState, { title: string; body: string; icon: keyof typeof Ionicons.glyphMap }> = {
  unknown: { title: "Autorizza l'accesso alle foto", body: "Atlante legge solo le foto che autorizzi.", icon: "images-outline" },
  granted_full: { title: "Accesso completo", body: "Tutte le foto autorizzate sono disponibili.", icon: "checkmark-circle-outline" },
  granted_limited: {
    title: "Accesso limitato",
    body: "La mappa contiene solo le foto che hai autorizzato.",
    icon: "filter-circle-outline",
  },
  denied: { title: "Accesso negato", body: "Attiva il permesso nelle Impostazioni di sistema per usare Atlante con le tue foto.", icon: "lock-closed-outline" },
  unavailable_in_preview: {
    title: "Richiede build nativa",
    body: "La libreria foto reale non è raggiungibile nell'anteprima web: funziona su una build iOS/TestFlight.",
    icon: "phone-portrait-outline",
  },
};

export default function PermissionBanner({
  state,
  onAction,
  actionLabel,
}: {
  state: PermissionState;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const { colors } = useTheme();
  const copy = COPY[state];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: colors.accentSoft,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <Ionicons name={copy.icon} size={22} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[type.footnoteStrong, { color: colors.text, fontSize: 15, lineHeight: 20 }]}>{copy.title}</Text>
        <Text style={[type.footnote, { color: colors.secondaryText, marginTop: 1 }]}>{copy.body}</Text>
      </View>
      {onAction && actionLabel ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={copy.body}
          hitSlop={8}
          style={({ pressed }) => [
            {
              backgroundColor: colors.accent,
              paddingHorizontal: spacing.md + 2,
              minHeight: 44,
              justifyContent: "center",
              borderRadius: radius.pill,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Text style={[type.footnoteStrong, { color: colors.onAccent }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
