import React, { useMemo, useState } from "react";
import { FlatList, LayoutChangeEvent, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTabBarHeight } from "../lib/useTabBarHeight";
import { GlassFill } from "../components/GlassFill";
import DemoBadge from "../components/DemoBadge";
import PermissionBanner from "../components/PermissionBanner";
import SettingsButton from "../components/SettingsButton";
import FocusablePressable from "../components/FocusablePressable";
import { ScanProgressCard } from "../components/ScanProgressCard";
import { AppMap } from "../components/AppMap";
import { PlaceSheet } from "../components/PlaceSheet";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { isValidCoordinate } from "../lib/geo/haversine";
import { PhotoCluster } from "../lib/geo/cluster";
import { tapFeedback } from "../lib/haptics";

/** Map-first home: the map is full-bleed under the status bar; title, year filter
 * and status cards float over it; a tapped place opens a bottom sheet. */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  // The tab bar is translucent and floats over the map: everything pinned to the
  // bottom sits above it, while the map itself continues underneath.
  const tabBarH = useTabBarHeight();
  const navigation = useNavigation<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { mode, permission, photos, indexStatus, requestRealAccess, locationCacheStale, rescan, startDemo, cancelScan, backgroundScan } = useAppState();
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [selected, setSelected] = useState<PhotoCluster | null>(null);
  const [topUiH, setTopUiH] = useState(180);

  const geotagged = useMemo(() => photos.filter((p) => isValidCoordinate(p.latitude, p.longitude)), [photos]);
  const years = useMemo(() => {
    const set = new Set<number>();
    geotagged.forEach((p) => p.createdAt != null && set.add(new Date(p.createdAt).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [geotagged]);
  const filtered = useMemo(
    () => (yearFilter ? geotagged.filter((p) => p.createdAt != null && new Date(p.createdAt).getFullYear() === yearFilter) : geotagged),
    [geotagged, yearFilter],
  );
  const places = useMemo(() => {
    const keys = new Set(filtered.map((p) => `${(p.latitude as number).toFixed(1)},${(p.longitude as number).toFixed(1)}`));
    return keys.size;
  }, [filtered]);
  const withoutLocation = photos.length - geotagged.length;
  const unavailableMetadata = useMemo(() => photos.filter((p) => p.metadataStatus === "unavailable").length, [photos]);
  const scanning = indexStatus.phase === "scanning";
  const scanCardVisible = scanning || ((indexStatus.phase === "paused" || indexStatus.phase === "cancelled") && indexStatus.cursor != null);

  const showRealBlocked = mode === "real" && permission === "unavailable_in_preview";
  const showPermissionAsk = mode === "real" && (permission === "unknown" || permission === "denied");
  // While scanning, the list grows every ~1.5 s: refitting on every count change made
  // the map jump (and re-cluster) continuously. Refit when the first photos appear
  // and once more when the scan settles.
  const fitCount = scanning ? (filtered.length > 0 ? "some" : "none") : String(filtered.length);
  const fitKey = `${mode}:${yearFilter ?? "all"}:${fitCount}`;

  const onTopLayout = (e: LayoutChangeEvent) => setTopUiH(e.nativeEvent.layout.height);
  const bottomUi = (selected ? 250 : 76) + tabBarH;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <AppMap photos={filtered} fitKey={fitKey} topInset={topUiH} bottomInset={bottomUi} onSelectCluster={setSelected} />

      {/* Floating top stack */}
      <View style={[s.topStack, { paddingTop: insets.top + spacing.sm }]} onLayout={onTopLayout} pointerEvents="box-none">
        <View style={[s.titleCard, shadow.raised]}>
          <GlassFill radius={radius.xl} strong />
          <View style={s.brandMark}>
            <Ionicons name="compass" size={20} color={colors.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Atlante</Text>
            <Text style={s.subtitle} numberOfLines={1}>
              {filtered.length} foto · {places} {places === 1 ? "luogo" : "luoghi"}
              {yearFilter ? ` · ${yearFilter}` : ""}
            </Text>
          </View>
          {mode === "demo" && <DemoBadge />}
          <SettingsButton />
        </View>

        {years.length > 0 && (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.yearRow}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: 6 }}
            data={[null, ...years]}
            keyExtractor={(y) => String(y)}
            renderItem={({ item }) => {
              const active = yearFilter === item;
              return (
                <FocusablePressable
                  onPress={() => {
                    tapFeedback();
                    setSelected(null);
                    setYearFilter(item);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item == null ? "Mostra tutti gli anni" : `Mostra le foto del ${item}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed, hovered }: any) => [
                    s.yearChip,
                    shadow.card,
                    active && s.yearChipActive,
                    (pressed || hovered) && { transform: [{ scale: 0.96 }] },
                  ]}
                >
                  {!active && <GlassFill radius={radius.pill} strong />}
                  <Text style={[s.yearChipText, active && s.yearChipTextActive]}>{item ?? "Tutti gli anni"}</Text>
                </FocusablePressable>
              );
            }}
          />
        )}

        <View style={s.notices} pointerEvents="box-none">
          {showPermissionAsk && (
            <View style={s.bannerWrap}>
              <PermissionBanner state={permission} onAction={requestRealAccess} actionLabel="Autorizza" />
            </View>
          )}
          {showRealBlocked && (
            <View style={s.bannerWrap}>
              <PermissionBanner state="unavailable_in_preview" onAction={() => startDemo()} actionLabel="Prova la demo" />
            </View>
          )}
          <ScanProgressCard
            status={indexStatus}
            onPause={cancelScan}
            onResume={() => rescan()}
            background={mode === "real" && Platform.OS === "ios" ? backgroundScan : null}
          />
          {indexStatus.phase === "error" && indexStatus.lastError ? (
            <View style={[s.notice, shadow.card]}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={[s.noticeText, { color: colors.danger }]} numberOfLines={2}>
                {indexStatus.lastError}
              </Text>
              <FocusablePressable onPress={() => rescan()} hitSlop={10} accessibilityRole="button" style={s.noticeAction}>
                <Text style={s.noticeActionText}>Riprova</Text>
              </FocusablePressable>
            </View>
          ) : null}
          {locationCacheStale && !scanCardVisible && (
            <View style={[s.notice, shadow.card]}>
              <Ionicons name="refresh-circle" size={18} color={colors.warn} />
              <View style={{ flex: 1 }}>
                <Text style={s.noticeTitle}>Posizioni da ricontrollare</Text>
                <Text style={s.noticeBody}>I dati salvati vengono da una versione che non leggeva le coordinate. Rilancia la scansione.</Text>
              </View>
              <FocusablePressable
                style={s.pillButton}
                onPress={() => rescan()}
                disabled={scanning}
                accessibilityRole="button"
                accessibilityLabel="Riscansiona le posizioni delle foto"
              >
                <Text style={s.pillButtonText}>Riscansiona</Text>
              </FocusablePressable>
            </View>
          )}
          {(unavailableMetadata > 0 || permission === "granted_limited") && (
            <View style={[s.infoPill, shadow.card]}>
              <GlassFill radius={radius.pill} strong />
              <Ionicons name={unavailableMetadata > 0 ? "cloud-offline-outline" : "filter-circle-outline"} size={14} color={colors.warn} />
              <Text style={s.infoPillText} numberOfLines={2}>
                {unavailableMetadata > 0
                  ? `${unavailableMetadata} foto su iCloud non ancora leggibili: posizione non confermata.`
                  : "Accesso limitato: la mappa mostra solo le foto autorizzate."}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Empty map: keep the map, explain what will appear and how to fill it. */}
      {filtered.length === 0 && !selected && (
        <View style={[s.emptyWrap, { paddingBottom: tabBarH + 80 }]} pointerEvents="box-none">
          <View style={[s.emptyCard, shadow.raised]}>
            <View style={s.emptyIcon}>
              <Ionicons name={scanning ? "hourglass-outline" : "images-outline"} size={22} color={colors.accent} />
            </View>
            <Text style={s.emptyTitle}>{scanning ? "Sto leggendo le tue foto" : "Qui compariranno i tuoi luoghi"}</Text>
            <Text style={s.emptyBody}>
              {scanning
                ? "Ogni foto con posizione apparirà sulla mappa appena letta."
                : mode === "real" && permission !== "granted_full" && permission !== "granted_limited"
                  ? "Autorizza l'accesso alle foto: Atlante mette sulla mappa quelle che hanno una posizione."
                  : "Nessuna foto con posizione per questo filtro. Le altre restano in Ricordi."}
            </Text>
          </View>
        </View>
      )}

      {withoutLocation > 0 && !selected && (
        <FocusablePressable
          style={({ pressed }) => [s.noLocationPill, { bottom: tabBarH + spacing.md }, shadow.raised, pressed && { transform: [{ scale: 0.97 }] }]}
          onPress={() => navigation.navigate("NoLocation")}
          accessibilityRole="button"
          accessibilityLabel={`${withoutLocation} foto senza posizione`}
          accessibilityHint="Apre l'elenco delle foto prive di coordinate"
        >
          <GlassFill radius={radius.pill} strong />
          <Ionicons name="location-outline" size={16} color={colors.secondaryText} />
          <Text style={s.noLocationText}>{withoutLocation} senza posizione</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.mutedText} />
        </FocusablePressable>
      )}

      <PlaceSheet
        cluster={selected}
        bottomOffset={tabBarH}
        onClose={() => setSelected(null)}
        onOpenPhoto={(id) => navigation.navigate("PhotoDetail", { photoId: id })}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.mapWater },
    topStack: { position: "absolute", top: 0, left: 0, right: 0 },
    titleCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginHorizontal: spacing.lg,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: radius.xl,
      maxWidth: 720,
      alignSelf: "stretch",
    },
    brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
    title: { ...type.title3, fontWeight: "700", color: c.text },
    subtitle: { ...type.footnote, color: c.secondaryText },
    yearRow: { flexGrow: 0, marginTop: spacing.sm },
    yearChip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.pill },
    yearChipActive: { backgroundColor: c.accent },
    yearChipText: { ...type.subheadStrong, color: c.text },
    yearChipTextActive: { color: c.onAccent },
    notices: { marginTop: spacing.sm, maxWidth: 720, width: "100%", alignSelf: "center" },
    bannerWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.surface,
    },
    noticeTitle: { ...type.footnoteStrong, color: c.text },
    noticeBody: { ...type.caption, color: c.secondaryText, marginTop: 1 },
    noticeText: { ...type.footnote, flex: 1 },
    noticeAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
    noticeActionText: { ...type.footnoteStrong, color: c.accent },
    pillButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.accent },
    pillButtonText: { ...type.footnoteStrong, color: c.onAccent },
    infoPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      marginHorizontal: spacing.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      maxWidth: 520,
    },
    infoPillText: { ...type.caption, color: c.secondaryText, flexShrink: 1 },
    emptyWrap: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", alignItems: "center", paddingHorizontal: spacing.lg },
    emptyCard: { width: "100%", maxWidth: 420, backgroundColor: c.surfaceElevated, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
    emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" },
    emptyTitle: { ...type.headline, color: c.text, textAlign: "center" },
    emptyBody: { ...type.subhead, color: c.secondaryText, textAlign: "center" },
    noLocationPill: {
      position: "absolute",
      left: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
    },
    noLocationText: { ...type.footnoteStrong, color: c.text },
  });
