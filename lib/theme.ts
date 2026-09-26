import { Platform, TextStyle, ViewStyle } from "react-native";

/**
 * Single source of design tokens for Atlante.
 *
 * The visual language follows Apple's iOS conventions rather than a "web dashboard"
 * look: grouped backgrounds instead of outlined boxes, hairline separators instead of
 * 1px borders around every card, a real SF-style type ramp, and soft elevation.
 *
 * Two complete palettes are exported (light + dark) with IDENTICAL keys, so every
 * screen can simply read `colors` from `useTheme()` and never branch on the scheme.
 */

export type Palette = {
  /** App canvas (iOS "grouped background"). */
  background: string;
  /** Cards, list groups, sheets. */
  surface: string;
  /** A surface sitting on top of another surface (dark mode needs real elevation). */
  surfaceElevated: string;
  /** Subtle filled area: image placeholders, inert chips, progress tracks. */
  fill: string;
  text: string;
  secondaryText: string;
  mutedText: string;
  /** Hairline separator (iOS separator colour, already semi-transparent). */
  separator: string;
  /** Legacy alias of `separator` for borders that must stay visible. */
  border: string;
  accent: string;
  /** Tinted accent background (chips, icon wells, informational cards). */
  accentSoft: string;
  /** Text/icon colour that sits on top of `accent`. */
  onAccent: string;
  success: string;
  warn: string;
  danger: string;
  mapWater: string;
  demoBadge: string;
  demoBadgeSoft: string;
  /** Scrim used over photos so white text stays readable. */
  scrim: string;
  /** Translucent material for controls floating over the map. */
  glass: string;
};

export const lightColors: Palette = {
  background: "#F2F1EE",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  fill: "#E6E5E1",
  text: "#111114",
  secondaryText: "#5C5C63",
  mutedText: "#8A8A90",
  separator: "rgba(60,60,67,0.16)",
  border: "rgba(60,60,67,0.16)",
  accent: "#1D6FA5",
  accentSoft: "#E1EDF5",
  onAccent: "#FFFFFF",
  success: "#2F8B57",
  warn: "#9A6A16",
  danger: "#C0392B",
  mapWater: "#DCE7EF",
  demoBadge: "#6E5AA8",
  demoBadgeSoft: "#EFEAFA",
  scrim: "rgba(0,0,0,0.42)",
  glass: "rgba(255,255,255,0.92)",
};

export const darkColors: Palette = {
  background: "#000000",
  surface: "#1C1C1E",
  surfaceElevated: "#2C2C2E",
  fill: "#2C2C2E",
  text: "#FFFFFF",
  secondaryText: "#AEAEB2",
  mutedText: "#8E8E93",
  separator: "rgba(84,84,88,0.65)",
  border: "rgba(84,84,88,0.65)",
  accent: "#4FB0E8",
  accentSoft: "rgba(79,176,232,0.18)",
  onAccent: "#04121C",
  success: "#32D74B",
  warn: "#FFD264",
  danger: "#FF6B61",
  mapWater: "#12212B",
  demoBadge: "#C3B2FF",
  demoBadgeSoft: "rgba(195,178,255,0.18)",
  scrim: "rgba(0,0,0,0.55)",
  glass: "rgba(28,28,30,0.9)",
};

/** Fallback palette for the few places that cannot consume React context
 * (the root error boundary, which must render even if providers failed). */
export const colors = lightColors;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** iOS-ish corner radii: continuous-looking cards, pill buttons. */
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

/** Hairline that matches the platform's real 1px-on-retina separator. */
export const hairline = Platform.OS === "web" ? 1 : 0.5;

/** San Francisco on Apple platforms, the closest system stack elsewhere. */
export const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}) as string;

const f = (style: TextStyle): TextStyle => ({ fontFamily, ...style });

/**
 * Apple's type ramp. Each level has a distinct size AND weight AND line-height —
 * that pairing is what makes a screen read as designed instead of flat.
 */
export const type = {
  /** 34/41 bold — screen titles ("large title"). */
  largeTitle: f({ fontSize: 34, fontWeight: "700", lineHeight: 41, letterSpacing: 0.37 }),
  /** 28/34 bold — hero numbers and secondary screen titles. */
  title1: f({ fontSize: 28, fontWeight: "700", lineHeight: 34, letterSpacing: 0.36 }),
  /** 22/28 bold. */
  title2: f({ fontSize: 22, fontWeight: "700", lineHeight: 28, letterSpacing: 0.35 }),
  /** 20/25 semibold. */
  title3: f({ fontSize: 20, fontWeight: "600", lineHeight: 25, letterSpacing: 0.38 }),
  /** 17/22 semibold — the emphasised row/card title. */
  headline: f({ fontSize: 17, fontWeight: "600", lineHeight: 22, letterSpacing: -0.41 }),
  /** 17/22 regular — default reading size. */
  body: f({ fontSize: 17, fontWeight: "400", lineHeight: 22, letterSpacing: -0.41 }),
  /** 16/21 regular. */
  callout: f({ fontSize: 16, fontWeight: "400", lineHeight: 21, letterSpacing: -0.32 }),
  /** 15/20 regular — secondary rows, descriptions. */
  subhead: f({ fontSize: 15, fontWeight: "400", lineHeight: 20, letterSpacing: -0.24 }),
  /** 15/20 semibold. */
  subheadStrong: f({ fontSize: 15, fontWeight: "600", lineHeight: 20, letterSpacing: -0.24 }),
  /** 13/18 regular — footnotes, metadata. */
  footnote: f({ fontSize: 13, fontWeight: "400", lineHeight: 18, letterSpacing: -0.08 }),
  /** 13/18 semibold. */
  footnoteStrong: f({ fontSize: 13, fontWeight: "600", lineHeight: 18, letterSpacing: -0.08 }),
  /** 12/16 regular. */
  caption: f({ fontSize: 12, fontWeight: "400", lineHeight: 16 }),
  /** 12/16 semibold — uppercase group headers, badges. */
  captionStrong: f({ fontSize: 12, fontWeight: "600", lineHeight: 16, letterSpacing: 0.3 }),
  /** 11/13 semibold — tab bar labels. */
  tabLabel: f({ fontSize: 11, fontWeight: "600", lineHeight: 13, letterSpacing: 0.06 }),

  // ---- Legacy aliases (kept so nothing silently loses its styling) ----
  display: f({ fontSize: 34, fontWeight: "700", lineHeight: 41, letterSpacing: 0.37 }),
  title: f({ fontSize: 22, fontWeight: "700", lineHeight: 28, letterSpacing: 0.35 }),
  heading: f({ fontSize: 17, fontWeight: "600", lineHeight: 22, letterSpacing: -0.41 }),
  bodyMedium: f({ fontSize: 17, fontWeight: "600", lineHeight: 22, letterSpacing: -0.41 }),
};

/**
 * Elevation. Light mode uses a soft, wide, low-opacity shadow (never a border);
 * dark mode uses a lighter SURFACE instead, because shadows are invisible on black.
 */
export const shadows: Record<"light" | "dark", { card: ViewStyle; raised: ViewStyle }> = {
  light: {
    card: {
      shadowColor: "#151312",
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    raised: {
      shadowColor: "#151312",
      shadowOpacity: 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
  },
  dark: {
    card: { shadowColor: "#000000", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
    raised: { shadowColor: "#000000", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  },
};

/** Legacy export kept for compatibility. */
export const shadow = shadows.light;
