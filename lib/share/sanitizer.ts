import { PhotoAsset, PhotoOverride, PrivateZone } from "../types";
import { haversineKm } from "../geo/haversine";

export interface SanitizedStop {
  photoId: string;
  uri: string;
  approxLabel: string | null; // e.g. "Roma", never a precise address unless confirmed public
}

/** The only shape the card renderer is allowed to read. Nothing upstream of this
 * (raw coordinates, library ids, precise dates) reaches the renderer. */
export interface SanitizedShareModel {
  title: string;
  periodLabel: string | null;
  stops: SanitizedStop[];
  /** True sequence-of-stops connector, never described as "route actually traveled":
   * see the UI copy rule in screens/ShareCardScreen.tsx. */
  hasSequence: boolean;
}

/** Removes photos inside any private zone, strips precise coordinates, and reduces
 * location to a coarse label. Must run BEFORE any bounds/center/thumbnail math for
 * the exported card — see plan §10 ("hiding a marker after computing the center is
 * not enough"). */
export function sanitizeForTravelCard(
  title: string,
  periodLabel: string | null,
  selected: PhotoAsset[],
  overrides: Record<string, PhotoOverride>,
  placeNames: Record<string, string | null>,
  privateZones: PrivateZone[],
): SanitizedShareModel {
  const stops: SanitizedStop[] = [];
  for (const photo of selected) {
    const ov = overrides[photo.id];
    if (ov?.excludeFromApp || ov?.excludeFromSharing) continue;
    const lat = ov?.manualLatitude ?? photo.latitude;
    const lon = ov?.manualLongitude ?? photo.longitude;
    if (lat != null && lon != null) {
      const inPrivateZone = privateZones.some((z) => haversineKm(lat, lon, z.latitude, z.longitude) * 1000 <= z.radiusMeters);
      if (inPrivateZone) continue;
    }
    stops.push({ photoId: photo.id, uri: photo.uri, approxLabel: placeNames[photo.id] ?? null });
  }
  return { title, periodLabel, stops, hasSequence: stops.length > 1 };
}

export interface SanitizedQuizResultModel {
  scoreLabel: string;
  coverUri: string | null;
}

export function sanitizeForQuizResultCard(points: number, maxPoints: number, coverPhoto: PhotoAsset | null, overrides: Record<string, PhotoOverride>): SanitizedQuizResultModel {
  const coverAllowed = coverPhoto && !overrides[coverPhoto.id]?.excludeFromSharing && !overrides[coverPhoto.id]?.excludeFromApp;
  return { scoreLabel: `${points} / ${maxPoints}`, coverUri: coverAllowed ? coverPhoto!.uri : null };
}
