import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import FocusablePressable from "./FocusablePressable";
import { PhotoMarker } from "./PhotoMarker";
import { GlassFill } from "./GlassFill";
import { radius, spacing } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { PhotoAsset } from "../lib/types";
import { clusterForRegion, fitRegion, normLon, PhotoCluster, Region, relLon, sortNewestFirst, WORLD_REGION } from "../lib/geo/cluster";
import { CITIES } from "../lib/geo/cityIndex";
import { tapFeedback } from "../lib/haptics";

let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== "web") {
  // react-native-maps only exists in the native build. On web the chart below is
  // the stand-in, showing the SAME clusters and opening the SAME sheet.
  try {
    const maps = require("react-native-maps");
    MapView = maps.default;
    Marker = maps.Marker;
  } catch {
    MapView = null;
  }
}

export interface AppMapProps {
  photos: PhotoAsset[];
  /** Changes when the dataset/filter changes: the map refits to the new photos. */
  fitKey: string;
  /** Height covered by floating UI at the top / bottom, kept clear when fitting. */
  topInset: number;
  bottomInset: number;
  onSelectCluster: (c: PhotoCluster) => void;
}

const MIN_DELTA = 0.004;
const clampLat = (v: number) => Math.max(-80, Math.min(80, v));
const clampDelta = (v: number, max: number) => Math.max(MIN_DELTA, Math.min(max, v));

export function AppMap(props: AppMapProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };
  // Sorted once per dataset; every pan/zoom re-clusters this array without re-sorting.
  const sorted = useMemo(() => sortNewestFirst(props.photos), [props.photos]);
  const mapProps = { ...props, photos: sorted };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {Platform.OS !== "web" && MapView ? <NativeMap {...mapProps} size={size} /> : <ChartMap {...mapProps} size={size} />}
    </View>
  );
}

function MapControls({ bottom, onZoomIn, onZoomOut, onFit }: { bottom: number; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
  const { colors, shadow } = useTheme();
  const btn = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, isLast = false) => (
    <FocusablePressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: any) => [
        styles.ctrlBtn,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
        (pressed || hovered) && { backgroundColor: colors.fill },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </FocusablePressable>
  );
  return (
    <View style={[styles.ctrl, { bottom }, shadow.raised]}>
      <GlassFill radius={radius.md} strong />
      <View style={styles.ctrlInner}>
        {btn("add", "Ingrandisci", onZoomIn)}
        {btn("remove", "Riduci", onZoomOut)}
        {btn("scan-outline", "Inquadra tutte le foto", onFit, true)}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------
// Native: Apple Maps via react-native-maps. No user location is ever shown or read.
// ---------------------------------------------------------------------------------

type NativeMarkerProps = { cluster: PhotoCluster; onPress: (c: PhotoCluster) => void };
const NativeMarker: React.FC<NativeMarkerProps> = ({ cluster, onPress }) => {
  const [tracks, setTracks] = useState(true);
  return (
    <Marker
      coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracks}
      onPress={() => onPress(cluster)}
      accessibilityLabel={cluster.photos.length > 1 ? `Gruppo di ${cluster.photos.length} foto` : "Foto"}
      accessibilityHint="Mostra tutte le foto di questo punto"
    >
      <PhotoMarker uri={cluster.photos[0].uri} count={cluster.photos.length} onLoad={() => setTimeout(() => setTracks(false), 80)} />
    </Marker>
  );
};

function NativeMap({ photos, fitKey, topInset, bottomInset, onSelectCluster, size }: AppMapProps & { size: { w: number; h: number } }) {
  const { isDark } = useTheme();
  const ref = useRef<any>(null);
  const initial = useMemo(() => (photos.length ? fitRegion(photos) : WORLD_REGION), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [region, setRegion] = useState<Region>(initial);

  useEffect(() => {
    const r = photos.length ? fitRegion(photos) : WORLD_REGION;
    ref.current?.animateToRegion?.(r, 450);
    setRegion(r);
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const clusters = useMemo(
    () => clusterForRegion(photos, region, size.w || 390, Math.max(200, (size.h || 700) - topInset - bottomInset), 72),
    [photos, region, size, topInset, bottomInset],
  );

  // Like Apple Photos: a tap shows every photo grouped at the CURRENT zoom level
  // and never moves the map. Zooming stays on pinch / the +/- controls.
  const onPress = (c: PhotoCluster) => {
    tapFeedback();
    onSelectCluster(c);
  };
  const zoomBy = (f: number) =>
    ref.current?.animateToRegion?.(
      { ...region, latitudeDelta: clampDelta(region.latitudeDelta * f, 150), longitudeDelta: clampDelta(region.longitudeDelta * f, 340) },
      280,
    );

  return (
    <>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={initial}
        onRegionChangeComplete={(r: Region) => setRegion(r)}
        userInterfaceStyle={isDark ? "dark" : "light"}
        mapPadding={{ top: topInset + 66, bottom: bottomInset, left: 32, right: 64 }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {clusters.map((c) => (
          <NativeMarker key={c.key} cluster={c} onPress={onPress} />
        ))}
      </MapView>
      <MapControls
        bottom={bottomInset + spacing.md}
        onZoomIn={() => zoomBy(0.45)}
        onZoomOut={() => zoomBy(2.2)}
        onFit={() => ref.current?.animateToRegion?.(photos.length ? fitRegion(photos) : WORLD_REGION, 450)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------
// Web / preview: a drawn chart (graticule + city labels) with the same markers,
// clustering, zoom and sheet. Drag to pan, buttons to zoom.
// ---------------------------------------------------------------------------------

const GRID_STEPS = [90, 45, 30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005];
const MARKER_W = 64;
const MARKER_H = 66;

function ChartMap({ photos, fitKey, topInset, bottomInset, onSelectCluster, size }: AppMapProps & { size: { w: number; h: number } }) {
  const { colors, isDark } = useTheme();
  const [region, setRegion] = useState<Region>(() => (photos.length ? fitRegion(photos) : WORLD_REGION));
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });

  useEffect(() => {
    setRegion(photos.length ? fitRegion(photos) : WORLD_REGION);
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const w = size.w || 390;
  const h = size.h || 700;
  // Markers are drawn ABOVE their point (pin tip at the coordinate), so reserve their
  // height at the top; reserve half a marker plus the zoom controls horizontally.
  const usableTop = topInset + MARKER_H;
  const usableH = Math.max(120, h - usableTop - bottomInset - 8);
  const centerY = usableTop + usableH / 2;
  const usableW = Math.max(120, w - MARKER_W - 64);
  const centerX = MARKER_W / 2 + usableW / 2;
  const scale = Math.min(usableW / region.longitudeDelta, usableH / region.latitudeDelta);
  const s = Math.max(scale, 0.5);

  const stateRef = useRef({ region, s });
  stateRef.current = { region, s };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderMove: (_e, g) => setDrag({ dx: g.dx, dy: g.dy }),
        onPanResponderRelease: (_e, g) => {
          const { region: r, s: sc } = stateRef.current;
          setRegion({ ...r, longitude: normLon(r.longitude - g.dx / sc), latitude: clampLat(r.latitude + g.dy / sc) });
          setDrag({ dx: 0, dy: 0 });
        },
        onPanResponderTerminate: () => setDrag({ dx: 0, dy: 0 }),
      }),
    [],
  );

  const project = (lat: number, lon: number) => ({
    x: centerX + relLon(lon, region.longitude) * s + drag.dx,
    y: centerY - (lat - region.latitude) * s + drag.dy,
  });

  const viewRegion: Region = { latitude: region.latitude, longitude: region.longitude, longitudeDelta: w / s, latitudeDelta: h / s };
  const clusters = useMemo(() => clusterForRegion(photos, viewRegion, w, h, 72), [photos, region.latitude, region.longitude, s, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  // Graticule
  const step = GRID_STEPS.find((st) => viewRegion.longitudeDelta / st <= 7) ?? GRID_STEPS[GRID_STEPS.length - 1];
  const lonLines: number[] = [];
  const halfLon = viewRegion.longitudeDelta / 2 + step + Math.abs(drag.dx) / s;
  for (let v = Math.ceil((region.longitude - halfLon) / step) * step; v <= region.longitude + halfLon && lonLines.length < 40; v += step) lonLines.push(v);
  const latLines: number[] = [];
  const topLat = region.latitude + (centerY + Math.abs(drag.dy)) / s;
  const botLat = region.latitude - (h - centerY + Math.abs(drag.dy)) / s;
  for (let v = Math.ceil(Math.max(-90, botLat) / step) * step; v <= Math.min(90, topLat) && latLines.length < 40; v += step) latLines.push(v);

  // City labels with greedy collision avoidance.
  const labels = useMemo(() => {
    const placed: { x: number; y: number; w: number }[] = [];
    const out: { name: string; x: number; y: number }[] = [];
    for (const c of CITIES) {
      const p = project(c.lat, c.lon);
      if (p.x < 8 || p.x > w - 8 || p.y < 8 || p.y > h - 8) continue;
      const lw = c.name.length * 6.4 + 10;
      const hit = placed.some((b) => Math.abs(b.x - p.x) < (b.w + lw) / 2 && Math.abs(b.y - p.y) < 18);
      if (hit) continue;
      placed.push({ x: p.x, y: p.y, w: lw });
      out.push({ name: c.name, x: p.x, y: p.y });
      if (out.length >= 36) break;
    }
    return out;
  }, [region, s, w, h, drag, centerY]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPress = (c: PhotoCluster) => {
    tapFeedback();
    onSelectCluster(c);
  };
  const zoomBy = (f: number) =>
    setRegion((r) => ({ ...r, latitudeDelta: clampDelta(r.latitudeDelta * f, 150), longitudeDelta: clampDelta(r.longitudeDelta * f, 340) }));

  const water1 = isDark ? "#0E1C26" : "#E4EEF4";
  const water2 = isDark ? "#07121A" : "#D3E3EE";
  const gridColor = isDark ? "rgba(120,170,200,0.14)" : "rgba(29,111,165,0.12)";
  const eq = project(0, region.longitude).y;

  return (
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill as any} pointerEvents="none">
        <Defs>
          <SvgGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={water1} />
            <Stop offset="1" stopColor={water2} />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#water)" />
        {lonLines.map((v) => {
          const x = centerX + (v - region.longitude) * s + drag.dx;
          return <Line key={`lo${v}`} x1={x} y1={0} x2={x} y2={h} stroke={gridColor} strokeWidth={1} />;
        })}
        {latLines.map((v) => {
          const y = project(v, region.longitude).y;
          return <Line key={`la${v}`} x1={0} y1={y} x2={w} y2={y} stroke={gridColor} strokeWidth={1} />;
        })}
        {eq > 0 && eq < h && (
          <Line x1={0} y1={eq} x2={w} y2={eq} stroke={colors.accent} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="6 6" />
        )}
        {labels.map((l) => (
          <React.Fragment key={l.name}>
            <Circle cx={l.x} cy={l.y} r={2.5} fill={colors.secondaryText} fillOpacity={0.7} />
            <SvgText x={l.x + 6} y={l.y + 4} fontSize={11} fontWeight="600" fill={colors.mutedText}>
              {l.name}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>

      {clusters.map((c) => {
        const p = project(c.latitude, c.longitude);
        if (p.x < -MARKER_W || p.x > w + MARKER_W || p.y < -MARKER_H || p.y > h + MARKER_H) return null;
        return (
          <FocusablePressable
            key={c.key}
            onPress={() => onPress(c)}
            accessibilityRole="button"
            accessibilityLabel={c.photos.length > 1 ? `Gruppo di ${c.photos.length} foto` : "Foto sulla mappa"}
            accessibilityHint="Mostra tutte le foto di questo punto"
            style={({ pressed, hovered }: any) => [
              { position: "absolute", left: p.x - MARKER_W / 2, top: p.y - MARKER_H, width: MARKER_W, alignItems: "center", borderRadius: radius.md },
              (pressed || hovered) && { transform: [{ scale: 1.06 }] },
            ]}
          >
            <PhotoMarker uri={c.photos[0].uri} count={c.photos.length} />
          </FocusablePressable>
        );
      })}

      <MapControls
        bottom={bottomInset + spacing.md}
        onZoomIn={() => zoomBy(0.45)}
        onZoomOut={() => zoomBy(2.2)}
        onFit={() => setRegion(photos.length ? fitRegion(photos) : WORLD_REGION)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ctrl: { position: "absolute", right: spacing.lg, borderRadius: radius.md },
  ctrlInner: { borderRadius: radius.md, overflow: "hidden" },
  ctrlBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
