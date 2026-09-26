import React, { ComponentProps, useState } from "react";
import { Platform, Pressable, StyleProp, ViewStyle } from "react-native";
import { useTheme } from "../lib/themeContext";

type Props = ComponentProps<typeof Pressable>;

/** Pressable with a visible keyboard-focus ring in the web runtime. Native keeps
 * the original styling and interaction unchanged. */
export default function FocusablePressable({ style, onFocus, onBlur, ...props }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const focusStyle: StyleProp<ViewStyle> =
    Platform.OS === "web" && focused
      ? {
          borderWidth: 2,
          borderColor: colors.accent,
          shadowColor: colors.accent,
          shadowOpacity: 0.28,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }
      : null;

  return (
    <Pressable
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => {
        const resolved = typeof style === "function" ? style(state) : style;
        return [resolved, focusStyle];
      }}
    />
  );
}
