import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";

/** Photo-thumbnail map marker: white ring, soft shadow, count bubble for clusters.
 * Uses RN Image (not expo-image) because native map markers snapshot their view and
 * need a reliable onLoad to stop tracking view changes. */
export function PhotoMarker({ uri, count, onLoad, size = 46 }: { uri: string; count: number; onLoad?: () => void; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, { borderRadius: size * 0.32 + 3 }]}>
        <Image
          source={{ uri }}
          onLoad={onLoad}
          onError={onLoad}
          style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: colors.fill }}
        />
      </View>
      {count > 1 && (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: colors.onAccent }]}>{count > 99 ? "99+" : count}</Text>
        </View>
      )}
      <View style={styles.pointer} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", padding: 6 },
  ring: {
    padding: 3,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: { ...type.captionStrong, fontSize: 11, lineHeight: 14, fontWeight: "700" },
  pointer: {
    width: 10,
    height: 10,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
    marginTop: -6,
    borderBottomRightRadius: 2,
  },
});
