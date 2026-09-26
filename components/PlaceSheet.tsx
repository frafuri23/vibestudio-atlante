import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { PhotoImage } from "./PhotoImage";
import { Ionicons } from "@expo/vector-icons";
import FocusablePressable from "./FocusablePressable";
import { GlassFill } from "./GlassFill";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useReduceMotion } from "../lib/useReduceMotion";
import { PhotoCluster } from "../lib/geo/cluster";
import { CityGroup, groupTitle, nearestCity } from "../lib/geo/cityIndex";
import { tapFeedback } from "../lib/haptics";
import { PhotoAsset } from "../lib/types";

const PEEK_H = 250;
const CHIPS_H = 52;
/** Above this many photos the per-city split is estimated from a sample (and the
 * city filter is hidden) so opening a world-zoom group never blocks the UI. */
const EXACT_LIMIT = 3000;
/** Groups larger than this open straight on the full grid, like Apple Photos. */
const OPEN_EXPANDED_OVER = 3;
const UNNAMED = "__unnamed";

/** Bottom sheet over the map listing EVERY photo grouped under the tapped marker at
 * the current zoom level (never just the first). Groups spanning several cities get
 * a combined title and a per-city filter. Core Animated only. */
export function PlaceSheet({
  cluster,
  onClose,
  onOpenPhoto,
  bottomOffset = 0,
}: {
  cluster: PhotoCluster | null;
  onClose: () => void;
  onOpenPhoto: (id: string) => void;
  /** Height of the translucent tab bar: the sheet rests on top of it. */
  bottomOffset?: number;
}) {
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const reduceMotion = useReduceMotion();
  const { height: winH, width: winW } = useWindowDimensions();
  const expandedH = Math.min((winH - bottomOffset) * 0.72, 620);
  const [expanded, setExpanded] = useState(false);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(PEEK_H)).current;

  // Derived once per cluster. Loops only (never Math.min(...array) on big arrays).
  const summary = useMemo(() => {
    if (!cluster) return null;
    const all = cluster.photos;
    const exact = all.length <= EXACT_LIMIT;
    const step = exact ? 1 : Math.max(1, Math.floor(all.length / 300));
    const counts = new Map<string, CityGroup>();
    const photoCity = new Map<string, string>();
    let unnamed = 0;
    for (let i = 0; i < all.length; i += step) {
      const p = all[i];
      const c = nearestCity(p.latitude, p.longitude);
      if (exact) photoCity.set(p.id, c ? c.name : UNNAMED);
      if (!c) {
        unnamed += 1;
        continue;
      }
      const g = counts.get(c.name);
      if (g) g.count += 1;
      else counts.set(c.name, { city: c, count: 1 });
    }
    const groups = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    const countries = new Set(groups.map((g) => g.city.country));
    let min = Infinity;
    let max = -Infinity;
    for (const p of all) {
      if (p.createdAt == null) continue;
      if (p.createdAt < min) min = p.createdAt;
      if (p.createdAt > max) max = p.createdAt;
    }
    return {
      exact,
      groups,
      unnamed,
      photoCity,
      countries: Array.from(countries),
      first: min === Infinity ? null : new Date(min),
      last: max === -Infinity ? null : new Date(max),
    };
  }, [cluster]);

  const showChips = !!summary && summary.exact && summary.groups.length + (summary.unnamed > 0 ? 1 : 0) >= 2;
  const peekH = PEEK_H + (showChips ? CHIPS_H : 0);

  useEffect(() => {
    if (!cluster) return;
    const startExpanded = cluster.photos.length > OPEN_EXPANDED_OVER;
    setExpanded(startExpanded);
    setCityFilter(null);
    heightAnim.setValue(startExpanded ? expandedH : peekH);
    slide.setValue(reduceMotion ? 0 : 40);
    Animated.timing(slide, { toValue: 0, duration: reduceMotion ? 0 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [cluster?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: expanded ? expandedH : peekH,
      duration: reduceMotion ? 0 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, expandedH, peekH]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible: PhotoAsset[] = useMemo(() => {
    if (!cluster || !summary) return [];
    if (!cityFilter) return cluster.photos;
    return cluster.photos.filter((p) => summary.photoCity.get(p.id) === cityFilter);
  }, [cluster, summary, cityFilter]);

  if (!cluster || !summary) return null;

  const { groups, countries, first, last } = summary;
  const fmt = (d: Date) => d.toLocaleDateString("it-IT", { month: "short", year: "numeric" });
  const period = first && last ? (fmt(first) === fmt(last) ? fmt(first) : `${fmt(first)} – ${fmt(last)}`) : "Data sconosciuta";
  const where =
    groups.length === 0
      ? ""
      : groups.length === 1
        ? ` · ${groups[0].city.country}`
        : countries.length === 1
          ? ` · ${groups.length} città · ${countries[0]}`
          : ` · ${groups.length} città in ${countries.length} paesi`;
  const cols = winW >= 700 ? 5 : 3;
  const tile = Math.floor((Math.min(winW, 760) - 2 * (cols - 1)) / cols);

  const chips: { key: string | null; label: string; count: number }[] = showChips
    ? [
        { key: null, label: "Tutte", count: cluster.photos.length },
        ...groups.map((g) => ({ key: g.city.name, label: g.city.name, count: g.count })),
        ...(summary.unnamed > 0 ? [{ key: UNNAMED, label: "Altri luoghi", count: summary.unnamed }] : []),
      ]
    : [];

  return (
    <Animated.View style={[s.outer, shadow.raised, { bottom: bottomOffset, transform: [{ translateY: slide }] }]}>
      <Animated.View style={[s.sheet, { height: heightAnim }]}>
        <GlassFill radius={radius.xl} strong />
        <FocusablePressable
          onPress={() => {
            tapFeedback();
            setExpanded((e) => !e);
          }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Riduci il pannello" : "Espandi il pannello"}
          style={s.handleArea}
        >
          <View style={s.handle} />
        </FocusablePressable>
        <View style={s.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.title} numberOfLines={1} accessibilityRole="header">
              {groupTitle(groups)}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {cluster.photos.length} foto · {period}
              {where}
            </Text>
          </View>
          <FocusablePressable
            onPress={() => setExpanded((e) => !e)}
            accessibilityRole="button"
            style={({ pressed }) => [s.textBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={s.textBtnLabel}>{expanded ? "Meno" : "Tutte"}</Text>
          </FocusablePressable>
          <FocusablePressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi" style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="close" size={18} color={colors.secondaryText} />
          </FocusablePressable>
        </View>

        {showChips && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipContent}>
            {chips.map((c) => {
              const active = cityFilter === c.key;
              return (
                <FocusablePressable
                  key={c.key ?? "all"}
                  onPress={() => {
                    tapFeedback();
                    setCityFilter(c.key);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.label}, ${c.count} foto`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed, hovered }: any) => [
                    s.chip,
                    active && s.chipActive,
                    (pressed || hovered) && !active && { backgroundColor: colors.separator },
                  ]}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[s.chipCount, active && s.chipTextActive]}>{c.count}</Text>
                </FocusablePressable>
              );
            })}
          </ScrollView>
        )}

        {expanded ? (
          <FlatList
            key={`grid-${cols}-${cityFilter ?? "all"}`}
            data={visible}
            keyExtractor={(p) => p.id}
            numColumns={cols}
            columnWrapperStyle={cols > 1 ? { gap: 2 } : undefined}
            contentContainerStyle={{ gap: 2, paddingBottom: spacing.xl }}
            initialNumToRender={cols * 6}
            maxToRenderPerBatch={cols * 4}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item }) => (
              <FocusablePressable onPress={() => onOpenPhoto(item.id)} accessibilityRole="button" accessibilityLabel="Apri foto">
                <PhotoImage uri={item.uri} style={{ width: tile, height: tile }} />
              </FocusablePressable>
            )}
          />
        ) : (
          <FlatList
            key={`strip-${cityFilter ?? "all"}`}
            horizontal
            data={visible}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            renderItem={({ item }) => (
              <FocusablePressable
                onPress={() => onOpenPhoto(item.id)}
                accessibilityRole="button"
                accessibilityLabel="Apri foto"
                style={({ pressed }) => [s.stripTile, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              >
                <PhotoImage uri={item.uri} style={StyleSheet.absoluteFill} />
              </FocusablePressable>
            )}
          />
        )}
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    outer: { position: "absolute", left: spacing.sm, right: spacing.sm, borderRadius: radius.xl },
    sheet: {
      borderRadius: radius.xl,
      overflow: "hidden",
      alignSelf: "center",
      width: "100%",
      maxWidth: 760,
    },
    handleArea: { alignItems: "center", justifyContent: "center", height: 24 },
    handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: c.separator },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    title: { ...type.title2, color: c.text },
    meta: { ...type.footnote, color: c.secondaryText, marginTop: 2 },
    textBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
    textBtnLabel: { ...type.subheadStrong, color: c.accent },
    closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    chipRow: { flexGrow: 0, height: CHIPS_H },
    chipContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "flex-start" },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: c.fill,
      maxWidth: 220,
    },
    chipActive: { backgroundColor: c.accent },
    chipText: { ...type.footnoteStrong, color: c.text, flexShrink: 1 },
    chipCount: { ...type.caption, color: c.secondaryText },
    chipTextActive: { color: c.onAccent },
    stripTile: { width: 140, height: 140, borderRadius: radius.md, overflow: "hidden", backgroundColor: c.fill },
  });
