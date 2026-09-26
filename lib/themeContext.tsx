import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme, ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { darkColors, lightColors, Palette, shadows } from "./theme";

export type ThemePreference = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

const STORAGE_KEY = "atlante.themePreference";

type ThemeValue = {
  colors: Palette;
  scheme: Scheme;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  shadow: { card: ViewStyle; raised: ViewStyle };
};

const fallback: ThemeValue = {
  colors: lightColors,
  scheme: "light",
  isDark: false,
  preference: "system",
  setPreference: () => {},
  shadow: shadows.light,
};

const ThemeContext = createContext<ThemeValue>(fallback);

/**
 * Wraps the whole app. The preference is persisted locally (AsyncStorage) and
 * defaults to "system", so Atlante follows iOS Light/Dark automatically unless the
 * user pins one in Impostazioni.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (saved === "light" || saved === "dark" || saved === "system")) {
          setPreferenceState(saved);
        }
      } catch {
        // A storage failure must never block rendering — "system" stays in effect.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme: Scheme = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
    return {
      colors: scheme === "dark" ? darkColors : lightColors,
      scheme,
      isDark: scheme === "dark",
      preference,
      setPreference,
      shadow: shadows[scheme],
    };
  }, [preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
