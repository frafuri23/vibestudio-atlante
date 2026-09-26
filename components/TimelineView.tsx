import React, { useMemo } from "react";
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { PhotoImage } from "./PhotoImage";
import { Ionicons } from "@expo/vector-icons";
import FocusablePressable from "./FocusablePressable";
import EmptyState from "./EmptyState";
import { Palette, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { PhotoAsset } from "../lib/types";
import { nearestCity } from "../lib/geo/cityIndex";

type Row =
  | { kind: "header"; key: string; label: string; year: number | null; count: number; places: string[] }
  | { kind: "photos"; key: string; photos: PhotoAsset[] };

const GAP = 2;
// Fixed month names: Intl formatting per photo was the slowest part of building the
// timeline on a large library.
const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
/** How many photos of a month are checked for a city name (the header shows 3). */
const PLACE_SAMPLE = 400;

/** Chronological view of every indexed photo (with or without location), grouped by
 * month. Flattened into header/photo rows so the list stays virtualized on large
 * libraries instead of rendering every photo at once. */
export function TimelineView({ photos, bottomPad, onOpenPhoto }: { photos: PhotoAsset[]; bottomPad: number; onOpenPhoto: (id: string) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 1100);
  const cols = contentW >= 1000 ? 6 : contentW >= 700 ? 5 : 3;
  const tile = Math.floor((contentW - GAP * (cols - 1)) / cols);

  const rows = useMemo<Row[]>(() => {
    const groups = new Map<string, { label: string; year: number | null; sort: number; photos: PhotoAsset[] }>();
    for (const p of photos) {
      let key = "nodate";
      let label = "Senza data";
      let year: number | null = null;
      let sort = -Infinity;
      if (p.createdAt != null) {
        const d = new Date(p.createdAt);
        key = `${d.getFullYear()}-${d.getMonth()}`;
        label = MONTHS[d.getMonth()];
        year = d.getFullYear();
        sort = d.getFullYear() * 12 + d.getMonth();
      }
      const g = groups.get(key);
      if (g) g.photos.push(p);
      else groups.set(key, { label, year, sort, photos: [p] });
    }
    const out: Row[] = [];
    Array.from(groups.entries())
      .sort((a, b) => b[1].sort - a[1].sort)
      .forEach(([key, g]) => {
        const sorted = [...g.photos].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        const placeSet: string[] = [];
        for (let i = 0; i < sorted.length && i < PLACE_SAMPLE; i++) {
          const p = sorted[i];
          const c = nearestCity(p.latitude, p.longitude);
          if (c && !placeSet.includes(c.name)) placeSet.push(c.name);
          if (placeSet.length >= 3) break;
        }
        out.push({ kind: "header", key: `h-${key}`, label: g.label, year: g.year, count: sorted.length, places: placeSet });
        for (let i = 0; i < sorted.length; i += cols) out.push({ kind: "photos", key: `r-${key}-${i}`, photos: sorted.slice(i, i + cols) });
      });
    return out;
  }, [photos, cols]);

  if (photos.length === 0) {
    return <EmptyState icon="time-outline" title="La timeline è vuota" message="Dopo la scansione, qui trovi tutte le foto in ordine di tempo, anche quelle senza posizione." />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: bottomPad, alignSelf: "center", width: contentW }}
      initialNumToRender={14}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews
      renderItem={({ item }) =>
        item.kind === "header" ? (
          <View style={s.header}>
            <Text style={s.month}>
              {item.label} <Text style={s.year}>{item.year ?? ""}</Text>
            </Text>
            <View style={s.metaRow}>
              <Text style={s.meta}>{item.count} foto</Text>
              {item.places.length > 0 && (
                <>
                  <Ionicons name="location" size={12} color={colors.accent} />
                  <Text style={s.meta} numberOfLines={1}>
                    {item.places.join(" · ")}
                  </Text>
                </>
              )}
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: GAP, marginBottom: GAP }}>
            {item.photos.map((p) => (
              <FocusablePressable
                key={p.id}
                onPress={() => onOpenPhoto(p.id)}
                accessibilityRole="button"
                accessibilityLabel="Apri foto"
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              >
                <PhotoImage uri={p.uri} style={{ width: tile, height: tile }} transition={120} />
                {p.latitude == null && (
                  <View style={s.noLoc}>
                    <Ionicons name="location-outline" size={11} color="#FFFFFF" />
                  </View>
                )}
              </FocusablePressable>
            ))}
          </View>
        )
      }
    />
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
    month: { ...type.title2, color: c.text },
    year: { ...type.title2, color: c.mutedText, fontWeight: "600" },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
    meta: { ...type.footnote, color: c.secondaryText, flexShrink: 1 },
    noLoc: {
      position: "absolute",
      right: 5,
      bottom: 5,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
  });
