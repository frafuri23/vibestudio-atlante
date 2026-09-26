import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FocusablePressable from "./FocusablePressable";
import { GlassFill } from "./GlassFill";
import { useTheme } from "../lib/themeContext";
import { radius, spacing, type } from "../lib/theme";
import { TAB_BAR_BASE, tabBarBottomGap } from "../lib/useTabBarHeight";
import { tapFeedback } from "../lib/haptics";

type Props = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: any }>;
  navigation: { emit: (e: any) => any; navigate: (name: string) => void };
};

/**
 * Floating Liquid Glass capsule tab bar (iOS 26 style): real glass on iOS 26 device
 * builds, frosted blur elsewhere. The selected tab gets a soft inner pill. Drawn by
 * hand so button size is under our control in EVERY runtime; its footprint is
 * mirrored by useTabBarHeight.
 */
export function GlassTabBar({ state, descriptors, navigation }: Props) {
  const { colors, shadow, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = tabBarBottomGap(insets.bottom);

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <View style={[styles.capsule, shadow.raised]}>
        <GlassFill radius={radius.pill} />
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options ?? {};
          const label: string = typeof options.title === "string" ? options.title : route.name;
          const focused = state.index === index;
          const color = focused ? colors.accent : colors.secondaryText;

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event?.defaultPrevented) {
              tapFeedback();
              navigation.navigate(route.name);
            }
          };

          return (
            <FocusablePressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              style={({ pressed }) => [
                styles.item,
                focused && { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)" },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              {typeof options.tabBarIcon === "function" ? options.tabBarIcon({ focused, color, size: 22 }) : null}
              <Text style={[type.tabLabel, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </FocusablePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  capsule: {
    flexDirection: "row",
    height: TAB_BAR_BASE,
    width: "100%",
    maxWidth: 420,
    padding: 4,
    borderRadius: radius.pill,
  },
  item: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderRadius: radius.pill,
  },
});
