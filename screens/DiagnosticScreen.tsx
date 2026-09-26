import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { NativePhotoLibraryAdapter } from "../lib/photoLibrary/nativeAdapter";
import { getRepository } from "../lib/db/repository";
import { BenchReport, runBenchmark } from "../lib/perf/benchmark";

const BENCH_SIZES = [1000, 10000, 50000];

type StepResult = { label: string; outcome: "ok" | "blocked" | "error"; detail: string };

/** Internal M0 diagnostic screen — not a production path. Runs the real native photo
 * → coordinates → persistence sequence and reports the true outcome of every step,
 * never a fabricated success. On the web/preview runtime, native steps report
 * "blocked" with the reason, as required by docs/NATIVE_CAPABILITIES.md. */
export default function DiagnosticScreen() {
  const insets = useSafeAreaInsets();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[]>([]);
  const [benchSize, setBenchSize] = useState<number | null>(null);
  const [benchStep, setBenchStep] = useState<string>("");
  const [benchReports, setBenchReports] = useState<BenchReport[]>([]);
  const [benchError, setBenchError] = useState<string | null>(null);

  const runBench = async (size: number) => {
    setBenchError(null);
    setBenchSize(size);
    try {
      const repo = await getRepository().catch(() => null);
      const report = await runBenchmark(size, repo, setBenchStep);
      setBenchReports((prev) => [report, ...prev.filter((r) => r.size !== size)]);
    } catch (e: any) {
      setBenchError(e?.message ?? "Benchmark non completato.");
    } finally {
      setBenchSize(null);
      setBenchStep("");
    }
  };

  const run = async () => {
    setRunning(true);
    const out: StepResult[] = [];
    const adapter = new NativePhotoLibraryAdapter();

    // Step 1: native module availability.
    if (!adapter.isAvailable) {
      out.push({
        label: "1. Modulo nativo expo-media-library",
        outcome: "blocked",
        detail: `Runtime attuale: ${Platform.OS}. In StackSail preview/website questo modulo nativo non esegue. Richiede build nativa (development build o TestFlight).`,
      });
      out.push({ label: "2. Richiesta permesso reale", outcome: "blocked", detail: "Non eseguibile senza il modulo nativo." });
      out.push({ label: "3. Lettura batch di asset reali", outcome: "blocked", detail: "Non eseguibile senza il modulo nativo." });
      out.push({ label: "4. Estrazione coordinate/orientamento", outcome: "blocked", detail: "Non eseguibile senza il modulo nativo." });
    } else {
      try {
        const perm = await adapter.requestPermission();
        out.push({ label: "1-2. Permesso libreria", outcome: "ok", detail: `Stato ottenuto dal sistema: ${perm}` });
        if (perm === "granted_full" || perm === "granted_limited") {
          const page = await adapter.getPage(null, 25);
          out.push({ label: "3. Lettura batch reale", outcome: "ok", detail: `${page.assets.length} asset letti, totale libreria: ${page.totalCount ?? "sconosciuto"}` });
          const withCoords = page.assets.filter((a) => a.latitude != null && a.longitude != null);
          const unreadable = page.assets.filter((a) => a.metadataStatus === "unavailable");
          const cloudPending = page.assets.filter((a) => a.cloudAvailability === "cloud_pending");
          const sample = withCoords[0];
          out.push({
            label: "4. Coordinate nei metadati",
            outcome: withCoords.length > 0 ? "ok" : unreadable.length === page.assets.length ? "error" : "blocked",
            detail:
              `${withCoords.length}/${page.assets.length} con coordinate reali` +
              (sample ? ` (es. ${sample.latitude!.toFixed(4)}, ${sample.longitude!.toFixed(4)})` : "") +
              `. Metadati non leggibili: ${unreadable.length}. Asset ancora su iCloud: ${cloudPending.length}. ` +
              `Lettura per-asset via getAssetInfoAsync + fallback GPS EXIF; una foto senza GPS (screenshot, GPS spento) resta correttamente senza coordinate.`,
          });
        } else {
          out.push({ label: "3. Lettura batch reale", outcome: "blocked", detail: "Permesso non concesso dall'utente." });
          out.push({ label: "4. Estrazione coordinate", outcome: "blocked", detail: "Permesso non concesso." });
        }
      } catch (e: any) {
        out.push({ label: "1-4. Sequenza libreria foto", outcome: "error", detail: e?.message ?? "Errore sconosciuto" });
      }
    }

    // Step 5: persistence round-trip — this genuinely executes everywhere (native
    // SQLite on device, AsyncStorage fallback on web) since it's our own adapter.
    try {
      const repo = await getRepository();
      const testId = `diagnostic-${Date.now()}`;
      await repo.upsertOverride({
        photoId: testId,
        manualLatitude: 45.4642,
        manualLongitude: 9.19,
        manualDate: null,
        excludeFromApp: false,
        excludeFromQuiz: false,
        excludeFromSharing: false,
        favoriteLocal: true,
      });
      const readBack = await repo.getOverride(testId);
      out.push({
        label: "5. Persistenza + lettura dopo scrittura",
        outcome: readBack?.favoriteLocal ? "ok" : "error",
        detail: `Motore: ${repo.backend}. Riga scritta e riletta: ${JSON.stringify(readBack)}`,
      });
    } catch (e: any) {
      out.push({ label: "5. Persistenza", outcome: "error", detail: e?.message ?? "Errore sconosciuto" });
    }

    // Step 6: map rendering capability.
    out.push({
      label: "6. Mappa nativa (react-native-maps / Apple Maps)",
      // Never "ok": mounting the module does not prove the map renders — manual check.
      outcome: "blocked",
      detail:
        Platform.OS === "web"
          ? "react-native-maps non renderizza in react-native-web: qui la Mappa usa una carta disegnata (react-native-svg) con gli stessi marker e raggruppamenti."
          : "Modulo presente. Questo passo NON prova il rendering: controlla a vista in Mappa che compaiano la mappa Apple, i marker con miniatura e i gruppi che si dividono ingrandendo.",
    });

    setResults(out);
    setRunning(false);
  };

  return (
    // SafeAreaView (frame-aware) protects the top inset when this screen is shown
    // without a navigation bar; under the native header its padding resolves to 0,
    // so the content is never double-inset.
    <SafeAreaView style={s.safe} edges={["top"]}>
    <ScrollView
      style={s.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
    >
      <Text style={s.subtitle}>
        Prova tecnica minima: permessi, lettura libreria, coordinate, persistenza, mappa. Ogni passo riporta l'esito
        reale, mai un successo simulato.
      </Text>

      <Pressable
        style={({ pressed }) => [s.runButton, shadow.card, pressed && { opacity: 0.85 }]}
        onPress={run}
        disabled={running}
        accessibilityRole="button"
      >
        <Ionicons name="play" size={16} color={colors.onAccent} />
        <Text style={s.runButtonText}>{running ? "Esecuzione…" : "Esegui diagnostica"}</Text>
      </Pressable>

      {results.map((r, i) => (
        <View key={i} style={[s.resultRow, shadow.card]}>
          <Ionicons
            name={r.outcome === "ok" ? "checkmark-circle" : r.outcome === "blocked" ? "alert-circle" : "close-circle"}
            size={19}
            color={r.outcome === "ok" ? colors.success : r.outcome === "blocked" ? colors.warn : colors.danger}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.resultLabel}>{r.label}</Text>
            <Text style={s.resultDetail}>{r.detail}</Text>
          </View>
        </View>
      ))}

      <Text style={s.sectionTitle}>Prestazioni con librerie grandi</Text>
      <Text style={s.subtitle}>
        Misura su questo dispositivo il lavoro che cresce con il numero di foto (mappa, ricordi, quiz). Le foto sono
        sintetiche, generate in memoria e mai salvate; solo la lettura della cache usa i dati reali, in sola lettura.
      </Text>
      <View style={s.benchRow}>
        {BENCH_SIZES.map((n) => (
          <Pressable
            key={n}
            style={({ pressed }) => [s.benchButton, pressed && { opacity: 0.7 }, benchSize != null && benchSize !== n && { opacity: 0.5 }]}
            onPress={() => runBench(n)}
            disabled={benchSize != null}
            accessibilityRole="button"
            accessibilityLabel={`Esegui benchmark con ${n} foto sintetiche`}
          >
            <Text style={s.benchButtonText}>{benchSize === n ? "In corso…" : `${n / 1000}k foto`}</Text>
          </Pressable>
        ))}
      </View>
      {benchSize != null && benchStep ? <Text style={s.resultDetail}>Passo: {benchStep}</Text> : null}
      {benchError ? <Text style={[s.resultDetail, { color: colors.danger }]}>{benchError}</Text> : null}
      {benchReports.map((r) => (
        <View key={r.size} style={[s.benchCard, shadow.card]}>
          <Text style={s.resultLabel}>{r.size.toLocaleString("it-IT")} foto · runtime {Platform.OS}</Text>
          {r.lines.map((l) => (
            <View key={l.label} style={s.benchLine}>
              <View style={{ flex: 1 }}>
                <Text style={s.benchLabel}>{l.label}</Text>
                {l.note ? <Text style={s.resultDetail}>{l.note}</Text> : null}
              </View>
              <Text style={[s.benchValue, { color: l.p95 > 100 ? colors.warn : colors.text }]}>
                {l.p50.toFixed(1)} / {l.p95.toFixed(1)} ms
              </Text>
            </View>
          ))}
          <Text style={s.resultDetail}>Valori: mediana / 95° percentile. Sopra 100 ms in arancione (percepibile al tocco).</Text>
        </View>
      ))}
    </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    root: { flex: 1, backgroundColor: c.background },
    subtitle: { ...type.subhead, color: c.secondaryText, marginTop: spacing.xs, marginBottom: spacing.lg },
    runButton: {
      flexDirection: "row",
      gap: spacing.sm,
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.lg,
    },
    runButtonText: { ...type.headline, color: c.onAccent },
    resultRow: {
      flexDirection: "row",
      gap: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    resultLabel: { ...type.footnoteStrong, color: c.text },
    sectionTitle: { ...type.headline, color: c.text, marginTop: spacing.xl, marginBottom: spacing.xs },
    benchRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    benchButton: { flex: 1, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" },
    benchButtonText: { ...type.subheadStrong, color: c.accent },
    benchCard: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
    benchLine: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    benchLabel: { ...type.footnote, color: c.text },
    benchValue: { ...type.footnoteStrong, fontVariant: ["tabular-nums"] },
    resultDetail: { ...type.caption, color: c.secondaryText, marginTop: 2, lineHeight: 17 },
  });
