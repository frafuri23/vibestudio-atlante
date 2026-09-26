import React, { useEffect, useState } from "react";
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Image, ImageContentFit } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/themeContext";
import { useReduceMotion } from "../lib/useReduceMotion";

// ONE pulse shared by every tile on screen: a grid of hundreds of photos drives a
// single Animated loop instead of one loop per tile (cheap in the JS-driven preview).
const sharedPulse = new Animated.Value(0);
let pulseUsers = 0;
let pulseLoop: Animated.CompositeAnimation | null = null;

function acquirePulse() {
  pulseUsers += 1;
  if (pulseUsers === 1) {
    pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sharedPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sharedPulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
  }
}

function releasePulse() {
  pulseUsers = Math.max(0, pulseUsers - 1);
  if (pulseUsers === 0 && pulseLoop) {
    pulseLoop.stop();
    pulseLoop = null;
  }
}

const pulseOpacity = sharedPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

type Props = {
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  accessibilityLabel?: string;
  /** Show a short "not available" caption in the failure state (large slots only). */
  showFailureLabel?: boolean;
};

/**
 * Photo slot with a neutral skeleton of its final size until the image loads, so
 * nothing jumps or flashes white. If the image can't be read (e.g. an iCloud original
 * not downloaded, or a photo no longer authorized) it shows an explicit state instead
 * of an endless grey box — never a fake image.
 */
export function PhotoImage({ uri, style, contentFit = "cover", transition = 150, accessibilityLabel, showFailureLabel }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [state, setState] = useState<"loading" | "loaded" | "failed">(uri ? "loading" : "failed");

  useEffect(() => {
    setState(uri ? "loading" : "failed");
  }, [uri]);

  const pulsing = state === "loading" && !reduceMotion;
  useEffect(() => {
    if (!pulsing) return;
    acquirePulse();
    return releasePulse;
  }, [pulsing]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.fill }, style]} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityLabel ? "image" : undefined}>
      {state === "loading" ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.separator, opacity: pulsing ? pulseOpacity : 0.6 }]}
        />
      ) : null}
      {state === "failed" ? (
        <View style={styles.failed} pointerEvents="none">
          <Ionicons name="cloud-offline-outline" size={showFailureLabel ? 28 : 18} color={colors.mutedText} />
          {showFailureLabel ? <Text style={[styles.failedText, { color: colors.mutedText }]}>Foto non disponibile</Text> : null}
        </View>
      ) : null}
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={reduceMotion ? 0 : transition}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  failed: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 6 },
  failedText: { fontSize: 13, fontWeight: "600" },
});
