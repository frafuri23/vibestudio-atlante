import seedrandom from "seedrandom";
import { PhotoAsset } from "../types";
import { CITIES } from "../geo/cityIndex";
import { clusterForRegion, fitRegion, sortNewestFirst, Region } from "../geo/cluster";
import { buildSuggestedMemories } from "../memories/engine";
import { buildQuizSession } from "../quiz/engine";
import { Repository } from "../db/repository";

/**
 * In-memory performance benchmark of the JS work that grows with library size.
 *
 * The photos are SYNTHETIC (generated here, labelled "bench-", never persisted,
 * never shown as the user's photos). The goal is to measure the algorithms, not to
 * pretend a real library was read. The only storage step is a READ of the real
 * local cache (harmless) to time the startup query on this device.
 */

export interface BenchLine {
  label: string;
  /** Median and 95th percentile in ms over the repetitions. */
  p50: number;
  p95: number;
  runs: number;
  note?: string;
}

export interface BenchReport {
  size: number;
  lines: BenchLine[];
}

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function measure(label: string, runs: number, fn: () => void, note?: string): Promise<BenchLine> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = now();
    fn();
    times.push(now() - t0);
    await tick(); // keep the UI responsive between repetitions
  }
  times.sort((a, b) => a - b);
  return { label, p50: percentile(times, 50), p95: percentile(times, 95), runs, note };
}

/** A plausible library: trips (bursts of photos over a few days around a city),
 * a home city with scattered daily photos, ~15% without GPS, over ~10 years. */
export function syntheticLibrary(size: number, seed = "atlante-bench"): PhotoAsset[] {
  const rng = seedrandom(`${seed}-${size}`);
  const home = CITIES[0];
  const out: PhotoAsset[] = [];
  const start = Date.UTC(2016, 0, 1);
  const span = 10 * 365 * 86400000;
  let i = 0;
  while (out.length < size) {
    const trip = rng() < 0.45;
    const city = trip ? CITIES[Math.floor(rng() * CITIES.length)] : home;
    const t0 = start + rng() * span;
    const burst = trip ? 20 + Math.floor(rng() * 120) : 1 + Math.floor(rng() * 6);
    for (let k = 0; k < burst && out.length < size; k++) {
      const hasGps = rng() > 0.15;
      out.push({
        id: `bench-${i++}`,
        libraryAssetId: `bench-${i}`,
        createdAt: Math.round(t0 + k * (rng() * 3 * 3600000)),
        modifiedAt: null,
        width: 4032,
        height: 3024,
        latitude: hasGps ? city.lat + (rng() - 0.5) * 0.08 : null,
        longitude: hasGps ? city.lon + (rng() - 0.5) * 0.08 : null,
        locationSource: hasGps ? "original_metadata" : "none",
        mediaSubtype: "photo",
        cloudAvailability: "local",
        uri: "",
        isDemo: true,
        metadataStatus: "ok",
        scanGeneration: 1,
      });
    }
  }
  return out;
}

const W = 390;
const H = 560;

export async function runBenchmark(size: number, repo: Repository | null, onProgress?: (label: string) => void): Promise<BenchReport> {
  const lines: BenchLine[] = [];
  const photos = syntheticLibrary(size);
  const geotagged = photos.filter((p) => p.latitude != null);
  await tick();

  onProgress?.("Ordinamento");
  lines.push(await measure("Ordinamento per data (una volta per dataset)", 3, () => void sortNewestFirst(geotagged)));
  const sorted = sortNewestFirst(geotagged);

  onProgress?.("Inquadratura");
  let world: Region = fitRegion(sorted);
  lines.push(await measure("Inquadratura di tutte le foto", 5, () => { world = fitRegion(sorted); }));

  onProgress?.("Raggruppamento mappa");
  let clusters = 0;
  lines.push(
    await measure("Raggruppamento mappa, vista mondo", 10, () => {
      clusters = clusterForRegion(sorted, world, W, H, 72).length;
    }),
  );
  lines[lines.length - 1].note = `${clusters} marker`;
  const city: Region = { latitude: CITIES[0].lat, longitude: CITIES[0].lon, latitudeDelta: 0.2, longitudeDelta: 0.2 };
  lines.push(
    await measure("Raggruppamento mappa, zoom su una città", 10, () => {
      clusters = clusterForRegion(sorted, city, W, H, 72).length;
    }),
  );
  lines[lines.length - 1].note = `${clusters} marker`;

  onProgress?.("Ricordi suggeriti");
  let chapters = 0;
  lines.push(
    await measure("Calcolo ricordi suggeriti", 3, () => {
      chapters = buildSuggestedMemories(photos, {}, []).chapters.length;
    }),
  );
  lines[lines.length - 1].note = `${chapters} capitoli`;

  onProgress?.("Quiz");
  lines.push(await measure("Creazione partita quiz (luogo)", 5, () => void buildQuizSession("place", photos, {}, `s-${Math.random()}`)));

  if (repo) {
    onProgress?.("Lettura cache locale");
    // Real read of THIS device's cache (not synthetic): timing of the startup query.
    const times: number[] = [];
    let rows = 0;
    for (let r = 0; r < 5; r++) {
      const t0 = now();
      rows = (await repo.getCachedPhotoAssets()).length;
      times.push(now() - t0);
    }
    times.sort((a, b) => a - b);
    lines.push({
      label: "Lettura cache foto all'avvio (dati reali del dispositivo)",
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      runs: 5,
      note: `${rows} righe, motore ${repo.backend}`,
    });
  }

  return { size, lines };
}
