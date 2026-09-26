import { PhotoAsset } from "../types";
import { isValidCoordinate } from "./haversine";

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface PhotoCluster {
  key: string;
  latitude: number;
  longitude: number;
  photos: PhotoAsset[];
  /** Spatial extent of the members, used to zoom into a cluster. */
  span: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}

export const WORLD_REGION: Region = { latitude: 42, longitude: 12, latitudeDelta: 60, longitudeDelta: 60 };

/** Longitude relative to a reference, in (-180, 180] — antimeridian-safe. */
export function relLon(lon: number, ref: number): number {
  let d = lon - ref;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function normLon(lon: number): number {
  return relLon(lon, 0);
}

/** Region that fits all given points. Picks whichever longitude framing (raw or
 * shifted by 360) gives the smaller span, so Fiji on both sides of +/-180 is framed
 * tightly instead of spanning the whole planet. */
export function fitRegion(points: { latitude: number | null; longitude: number | null }[], padding = 1.35): Region {
  const valid = points.filter((p) => isValidCoordinate(p.latitude, p.longitude)) as { latitude: number; longitude: number }[];
  if (valid.length === 0) return WORLD_REGION;
  // Plain loops, never Math.min(...array): spreading tens of thousands of arguments
  // overflows the call stack on Hermes/JSC with a large library.
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of valid) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
  }
  // Smallest arc covering every longitude: the complement of the largest empty gap
  // on the circle (handles the antimeridian and Europe+Pacific mixes correctly).
  const sorted = valid.map((p) => normLon(p.longitude)).sort((a, b) => a - b);
  let gapIdx = sorted.length - 1;
  let gap = sorted[0] + 360 - sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    const g = sorted[i + 1] - sorted[i];
    if (g > gap) {
      gap = g;
      gapIdx = i;
    }
  }
  const minLon = sorted[(gapIdx + 1) % sorted.length];
  const arc = 360 - gap;
  const maxLon = minLon + arc;
  const latDelta = Math.min(160, Math.max(0.02, (maxLat - minLat) * padding));
  const lonDelta = Math.min(340, Math.max(0.02, (maxLon - minLon) * padding));
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: normLon((minLon + maxLon) / 2),
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

/** Newest first, so a cluster's first member (its marker thumbnail) is the most
 * recent memory. Sort ONCE per dataset and pass the result to clusterForRegion,
 * which preserves input order inside every cluster (no per-cluster sort on each
 * pan/zoom). */
export function sortNewestFirst(photos: PhotoAsset[]): PhotoAsset[] {
  return [...photos].sort((a, c) => (c.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** How far outside the visible area (as a fraction of its size, per side) photos are
 * still clustered, so markers don't pop in at the edges during a small pan. */
const VIEWPORT_MARGIN = 0.6;
/** Hard cap on markers handed to the map: each native marker is a real view with an
 * image, and thousands of them freeze Apple Maps. Largest clusters win. */
const MAX_MARKERS = 250;

/** Grid clustering in SCREEN space: the cell size is a fixed number of pixels, so
 * clusters split apart as the user zooms in and merge as they zoom out.
 * Only photos inside the viewport (plus a margin) are clustered, so the cost and the
 * marker count depend on what is on screen, not on the size of the library.
 * Input order is preserved inside each cluster (see sortNewestFirst). */
export function clusterForRegion(
  photos: PhotoAsset[],
  region: Region,
  widthPx: number,
  heightPx: number,
  cellPx = 64,
): PhotoCluster[] {
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const limitX = w * (0.5 + VIEWPORT_MARGIN);
  const limitY = h * (0.5 + VIEWPORT_MARGIN);
  const pxPerLon = w / Math.max(region.longitudeDelta, 1e-6);
  const pxPerLat = h / Math.max(region.latitudeDelta, 1e-6);
  type Acc = { photos: PhotoAsset[]; sumLat: number; sumRel: number; span: PhotoCluster["span"]; alive: boolean };
  const accs: Acc[] = [];
  // Greedy distance clustering in screen space (Chebyshev distance, because markers
  // are boxes). A spatial hash keyed on the seed cell keeps it O(n) on big libraries.
  const hash = new Map<string, Acc[]>();
  const cx = (a: Acc) => ((a.sumRel / a.photos.length) * pxPerLon);
  const cy = (a: Acc) => ((a.sumLat / a.photos.length - region.latitude) * pxPerLat);
  for (const p of photos) {
    if (!isValidCoordinate(p.latitude, p.longitude)) continue;
    const lat = p.latitude as number;
    const rl = relLon(p.longitude as number, region.longitude);
    const x = rl * pxPerLon;
    const y = (lat - region.latitude) * pxPerLat;
    if (x > limitX || x < -limitX || y > limitY || y < -limitY) continue;
    const gx = Math.floor(x / cellPx);
    const gy = Math.floor(y / cellPx);
    let target: Acc | null = null;
    for (let dx = -1; dx <= 1 && !target; dx++) {
      for (let dy = -1; dy <= 1 && !target; dy++) {
        const list = hash.get(`${gx + dx}:${gy + dy}`);
        if (!list) continue;
        for (const a of list) {
          if (Math.max(Math.abs(cx(a) - x), Math.abs(cy(a) - y)) < cellPx) {
            target = a;
            break;
          }
        }
      }
    }
    if (target) {
      target.photos.push(p);
      target.sumLat += lat;
      target.sumRel += rl;
      target.span.minLat = Math.min(target.span.minLat, lat);
      target.span.maxLat = Math.max(target.span.maxLat, lat);
      target.span.minLon = Math.min(target.span.minLon, rl);
      target.span.maxLon = Math.max(target.span.maxLon, rl);
    } else {
      const a: Acc = { photos: [p], sumLat: lat, sumRel: rl, span: { minLat: lat, maxLat: lat, minLon: rl, maxLon: rl }, alive: true };
      accs.push(a);
      const k = `${gx}:${gy}`;
      const list = hash.get(k);
      if (list) list.push(a);
      else hash.set(k, [a]);
    }
  }
  // Centers drift while members join: merge any pair that ended up overlapping, so
  // no two markers are ever drawn on top of each other. Bounded for huge counts.
  // Culling already bounds the count to roughly what fits in the viewport + margin.
  if (accs.length <= 2000) {
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < accs.length; i++) {
        const a = accs[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < accs.length; j++) {
          const b = accs[j];
          if (!b.alive) continue;
          if (Math.max(Math.abs(cx(a) - cx(b)), Math.abs(cy(a) - cy(b))) < cellPx) {
            a.photos.push(...b.photos);
            a.sumLat += b.sumLat;
            a.sumRel += b.sumRel;
            a.span.minLat = Math.min(a.span.minLat, b.span.minLat);
            a.span.maxLat = Math.max(a.span.maxLat, b.span.maxLat);
            a.span.minLon = Math.min(a.span.minLon, b.span.minLon);
            a.span.maxLon = Math.max(a.span.maxLon, b.span.maxLon);
            b.alive = false;
            merged = true;
          }
        }
      }
    }
  }
  let alive = accs.filter((a) => a.alive);
  if (alive.length > MAX_MARKERS) {
    // The cap only ever drops clusters in the OFF-SCREEN margin: every cluster whose
    // center is inside the visible area is always kept, so no on-screen photo
    // disappears from the map on wide screens (desktop, iPad).
    const halfW = w / 2;
    const halfH = h / 2;
    const onScreen = (a: Acc) => Math.abs(cx(a)) <= halfW && Math.abs(cy(a)) <= halfH;
    const visible = alive.filter(onScreen);
    const margin = alive.filter((a) => !onScreen(a)).sort((a, b) => b.photos.length - a.photos.length);
    alive = visible.concat(margin.slice(0, Math.max(0, MAX_MARKERS - visible.length)));
  }
  const out: PhotoCluster[] = [];
  alive.forEach((b) => {
    const key = `${Math.round(cx(b) / cellPx)}:${Math.round(cy(b) / cellPx)}`;
    const n = b.photos.length;
    // Merged clusters append members out of order; restore newest-first only then
    // (a cheap check — most clusters are already ordered by the pre-sorted input).
    let sorted = b.photos;
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i].createdAt ?? 0) > (sorted[i - 1].createdAt ?? 0)) {
        sorted = [...b.photos].sort((a, c) => (c.createdAt ?? 0) - (a.createdAt ?? 0));
        break;
      }
    }
    out.push({
      key: `${key}:${n}:${sorted[0].id}`,
      latitude: b.sumLat / n,
      longitude: normLon(region.longitude + b.sumRel / n),
      photos: sorted,
      span: {
        minLat: b.span.minLat,
        maxLat: b.span.maxLat,
        minLon: normLon(region.longitude + b.span.minLon),
        maxLon: normLon(region.longitude + b.span.maxLon),
      },
    });
  });
  return out;
}

/** Region to zoom into a cluster, or null when its members sit (almost) on the same
 * spot — then zooming can't separate them and the caller should list them instead. */
export function zoomRegionFor(cluster: PhotoCluster, current: Region): Region | null {
  const latSpan = cluster.span.maxLat - cluster.span.minLat;
  const lonSpan = Math.abs(relLon(cluster.span.maxLon, cluster.span.minLon));
  if (cluster.photos.length < 2 || (latSpan < 0.002 && lonSpan < 0.002)) return null;
  const latitudeDelta = Math.max(latSpan * 2.2, 0.01);
  const longitudeDelta = Math.max(lonSpan * 2.2, 0.01);
  if (latitudeDelta >= current.latitudeDelta * 0.9 && longitudeDelta >= current.longitudeDelta * 0.9) return null;
  return {
    latitude: (cluster.span.minLat + cluster.span.maxLat) / 2,
    longitude: normLon(cluster.span.minLon + relLon(cluster.span.maxLon, cluster.span.minLon) / 2),
    latitudeDelta,
    longitudeDelta,
  };
}
