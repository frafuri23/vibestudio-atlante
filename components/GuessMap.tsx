import React, { useEffect, useMemo, useRef, useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, PanResponder, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import FocusablePressable from "./FocusablePressable";
import { radius, spacing } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { fitRegion, normLon, Region, relLon } from "../lib/geo/cluster";
import { CITIES } from "../lib/geo/cityIndex";
import { tapFeedback } from "../lib/haptics";

let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
if (Platform.OS !== "web") {
  try {
    const maps = require("react-native-maps");
    MapView = maps.default;
    Marker = maps.Marker;
    Polyline = maps.Polyline;
  } catch {
    MapView = null;
  }
}

export type LatLon = { latitude: number; longitude: number };

export interface GuessMapProps {
  /** The pin the player has placed (not yet confirmed). */
  guess: LatLon | null;
  onGuessChange: (g: LatLon) => void;
  /** Set once the answer is revealed: the map shows both pins and frames them. */
  answer: LatLon | null;
}

/** The whole inhabited world, so the starting view never hints at the answer. */
const START: Region = { latitude: 22, longitude: 15, latitudeDelta: 120, longitudeDelta: 300 };
const MIN_DELTA = 0.05;
const clampLat = (v: number) => Math.max(-80, Math.min(80, v));
const clampDelta = (v: number, max: number) => Math.max(MIN_DELTA, Math.min(max, v));

function revealRegion(guess: LatLon | null, answer: LatLon): Region {
  const pts = guess ? [guess, answer] : [answer];
  const r = fitRegion(pts, 1.9);
  return { ...r, latitudeDelta: Math.max(r.latitudeDelta, 3), longitudeDelta: Math.max(r.longitudeDelta, 3) };
}

export function GuessMap(props: GuessMapProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {Platform.OS !== "web" && MapView ? <NativeGuessMap {...props} /> : <ChartGuessMap {...props} size={size} />}
    </View>
  );
}

function Pin({ kind }: { kind: "guess" | "answer" }) {
  const { colors } = useTheme();
  const bg = kind === "guess" ? colors.accent : colors.success;
  return (
    <View style={styles.pinWrap} pointerEvents="none">
      <View style={[styles.pinHead, { backgroundColor: bg }]}>
        <Ionicons name={kind === "guess" ? "person" : "camera"} size={14} color="#FFFFFF" />
      </View>
      <View style={[styles.pinTail, { backgroundColor: bg }]} />
    </View>
  );
}

function Controls({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
  const { colors, shadow } = useTheme();
  const b = (icon: keyof typeof Ionicons.glyphMap, label: string, fn: () => void, last = false) => (
    <FocusablePressable
      onPress={() => {
        tapFeedback();
        fn();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: any) => [
        styles.ctrlBtn,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
        (pressed || hovered) && { backgroundColor: colors.fill },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </FocusablePressable>
  );
  return (
    <View style={[styles.ctrl, { backgroundColor: colors.surfaceElevated }, shadow.raised]}>
      <View style={styles.ctrlInner}>
        {b("add", "Ingrandisci", onZoomIn)}
        {b("remove", "Riduci", onZoomOut, true)}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------
// Native: Apple Maps. A tap places the pin; the answer is framed after confirming.
// ---------------------------------------------------------------------------------
function NativeGuessMap({ guess, onGuessChange, answer }: GuessMapProps) {
  const { isDark, colors } = useTheme();
  const ref = useRef<any>(null);
  const [region, setRegion] = useState<Region>(START);

  useEffect(() => {
    if (answer) ref.current?.animateToRegion?.(revealRegion(guess, answer), 500);
    else ref.current?.animateToRegion?.(START, 1);
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (f: number) =>
    ref.current?.animateToRegion?.(
      { ...region, latitudeDelta: clampDelta(region.latitudeDelta * f, 150), longitudeDelta: clampDelta(region.longitudeDelta * f, 340) },
      260,
    );

  return (
    <>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={START}
        onRegionChangeComplete={(r: Region) => setRegion(r)}
        userInterfaceStyle={isDark ? "dark" : "light"}
        showsUserLocation={false}
        showsPointsOfInterest={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={(e: any) => {
          if (answer) return;
          const c = e?.nativeEvent?.coordinate;
          if (!c) return;
          tapFeedback();
          onGuessChange({ latitude: c.latitude, longitude: c.longitude });
        }}
      >
        {guess && (
          <Marker coordinate={guess} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <Pin kind="guess" />
          </Marker>
        )}
        {answer && (
          <Marker coordinate={answer} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <Pin kind="answer" />
          </Marker>
        )}
        {answer && guess && Polyline && (
          <Polyline coordinates={[guess, answer]} strokeColor={colors.text} strokeWidth={2} lineDashPattern={[6, 6]} geodesic />
        )}
      </MapView>
      <Controls onZoomIn={() => zoomBy(0.4)} onZoomOut={() => zoomBy(2.4)} />
    </>
  );
}

// ---------------------------------------------------------------------------------
// Web / preview: drawn chart with city labels. Tap = place pin (inverse projection),
// drag = pan, buttons = zoom. Same contract as the native map, no fake answers.
// ---------------------------------------------------------------------------------
const GRID_STEPS = [30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1];

function ChartGuessMap({ guess, onGuessChange, answer, size }: GuessMapProps & { size: { w: number; h: number } }) {
  const { colors, isDark } = useTheme();
  const [region, setRegion] = useState<Region>(START);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const w = size.w || 358;
  const h = size.h || 320;
  const s = Math.max(0.3, Math.min(w / region.longitudeDelta, h / region.latitudeDelta));

  useEffect(() => {
    setRegion(answer ? revealRegion(guess, answer) : START);
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = useRef({ region, s, w, h, answer, onGuessChange, start: { x: 0, y: 0 } });
  live.current = { ...live.current, region, s, w, h, answer, onGuessChange };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          live.current.start = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        },
        onPanResponderMove: (_e, g) => setDrag({ dx: g.dx, dy: g.dy }),
        onPanResponderRelease: (_e, g) => {
          const L = live.current;
          setDrag({ dx: 0, dy: 0 });
          if (Math.abs(g.dx) + Math.abs(g.dy) > 6) {
            setRegion({ ...L.region, longitude: normLon(L.region.longitude - g.dx / L.s), latitude: clampLat(L.region.latitude + g.dy / L.s) });
            return;
          }
          if (L.answer) return;
          const { x, y } = L.start;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          const lon = normLon(L.region.longitude + (x - L.w / 2) / L.s);
          const lat = clampLat(L.region.latitude - (y - L.h / 2) / L.s);
          L.onGuessChange({ latitude: lat, longitude: lon });
        },
        onPanResponderTerminate: () => setDrag({ dx: 0, dy: 0 }),
      }),
    [],
  );

  const project = (lat: number, lon: number) => ({
    x: w / 2 + relLon(lon, region.longitude) * s + drag.dx,
    y: h / 2 - (lat - region.latitude) * s + drag.dy,
  });

  const viewLon = w / s;
  const step = GRID_STEPS.find((st) => viewLon / st <= 9) ?? GRID_STEPS[GRID_STEPS.length - 1];
  const lonLines: number[] = [];
  for (let v = Math.ceil((region.longitude - viewLon) / step) * step; v <= region.longitude + viewLon && lonLines.length < 60; v += step) lonLines.push(v);
  const latLines: number[] = [];
  const viewLat = h / s;
  for (let v = Math.ceil(Math.max(-90, region.latitude - viewLat) / step) * step; v <= Math.min(90, region.latitude + viewLat) && latLines.length < 60; v += step) latLines.push(v);

  const labels = useMemo(() => {
    const placed: { x: number; y: number; w: number }[] = [];
    const out: { name: string; x: number; y: number; showName: boolean }[] = [];
    for (const c of CITIES) {
      const p = project(c.lat, c.lon);
      if (p.x < 4 || p.x > w - 4 || p.y < 4 || p.y > h - 4) continue;
      const lw = c.name.length * 6 + 10;
      const hit = placed.some((b) => Math.abs(b.x - p.x) < (b.w + lw) / 2 && Math.abs(b.y - p.y) < 16);
      if (!hit) placed.push({ x: p.x, y: p.y, w: lw });
      out.push({ name: c.name, x: p.x, y: p.y, showName: !hit });
    }
    return out;
  }, [region, s, w, h, drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const water1 = isDark ? "#0E1C26" : "#E4EEF4";
  const water2 = isDark ? "#07121A" : "#D3E3EE";
  const gridColor = isDark ? "rgba(120,170,200,0.14)" : "rgba(29,111,165,0.12)";
  const g = guess ? project(guess.latitude, guess.longitude) : null;
  const a = answer ? project(answer.latitude, answer.longitude) : null;

  return (
    <View style={[StyleSheet.absoluteFill, Platform.OS === "web" ? ({ cursor: answer ? "default" : "crosshair", touchAction: "none" } as any) : null]} {...pan.panHandlers}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill as any} pointerEvents="none">
        <Defs>
          <SvgGradient id="gwater" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={water1} />
            <Stop offset="1" stopColor={water2} />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#gwater)" />
        {lonLines.map((v) => {
          const x = w / 2 + (v - region.longitude) * s + drag.dx;
          return <Line key={`lo${v}`} x1={x} y1={0} x2={x} y2={h} stroke={gridColor} strokeWidth={1} />;
        })}
        {latLines.map((v) => {
          const y = project(v, region.longitude).y;
          return <Line key={`la${v}`} x1={0} y1={y} x2={w} y2={y} stroke={gridColor} strokeWidth={1} />;
        })}
        {labels.map((l) => (
          <React.Fragment key={l.name}>
            <Circle cx={l.x} cy={l.y} r={2.2} fill={colors.secondaryText} fillOpacity={0.65} />
            {l.showName && (
              <SvgText x={l.x + 5} y={l.y + 4} fontSize={10.5} fontWeight="600" fill={colors.mutedText}>
                {l.name}
              </SvgText>
            )}
          </React.Fragment>
        ))}
        {g && a && <Line x1={g.x} y1={g.y} x2={a.x} y2={a.y} stroke={colors.text} strokeWidth={2} strokeDasharray="6 6" />}
      </Svg>
      {g && (
        <View pointerEvents="none" style={[styles.pinAbs, { left: g.x - 16, top: g.y - 40 }]}>
          <Pin kind="guess" />
        </View>
      )}
      {a && (
        <View pointerEvents="none" style={[styles.pinAbs, { left: a.x - 16, top: a.y - 40 }]}>
          <Pin kind="answer" />
        </View>
      )}
      <Controls
        onZoomIn={() => setRegion((r) => ({ ...r, latitudeDelta: clampDelta(r.latitudeDelta * 0.45, 150), longitudeDelta: clampDelta(r.longitudeDelta * 0.45, 340) }))}
        onZoomOut={() => setRegion((r) => ({ ...r, latitudeDelta: clampDelta(r.latitudeDelta * 2.2, 150), longitudeDelta: clampDelta(r.longitudeDelta * 2.2, 340) }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: { alignItems: "center", width: 32, height: 40 },
  pinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pinTail: { width: 3, height: 10, borderRadius: 2, marginTop: -1 },
  pinAbs: { position: "absolute" },
  ctrl: { position: "absolute", right: spacing.md, top: spacing.md, borderRadius: radius.md },
  ctrlInner: { borderRadius: radius.md, overflow: "hidden" },
  ctrlBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
