// Pure helpers that turn an expo-media-library `AssetInfo` into real coordinates.
// Kept free of any native import so the logic can be read/reviewed (and run) in any
// runtime — the native calls themselves live in nativeAdapter.ts.
//
// WHY THIS EXISTS: `MediaLibrary.getAssetsAsync` (the list call) NEVER returns GPS.
// Coordinates only arrive from the per-asset `getAssetInfoAsync`, and even there iOS
// exposes them in two different shapes depending on the asset:
//   1. `info.location` — the PHAsset's own location (the normal case);
//   2. `info.exif` GPS tags — present for imported/edited files whose PHAsset
//      location is not set (e.g. photos imported from a camera or AirDropped).
// Reading only (1) makes a sizeable slice of a real library look "senza posizione".

export type ExtractedLocationSource = "asset_location" | "exif" | "none";

export interface ExtractedLocation {
  latitude: number | null;
  longitude: number | null;
  source: ExtractedLocationSource;
}

export const NO_LOCATION: ExtractedLocation = { latitude: null, longitude: null, source: "none" };

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** EXIF stores the magnitude plus a hemisphere ref ("N"/"S", "E"/"W"). A photo taken
 * in Rio must not land in Europe because the ref was ignored. */
function applyHemisphere(magnitude: number, ref: unknown): number {
  const r = typeof ref === "string" ? ref.trim().toUpperCase() : "";
  const south = r === "S" || r === "SOUTH";
  const west = r === "W" || r === "WEST";
  if (south || west) return -Math.abs(magnitude);
  if (r === "N" || r === "E" || r === "NORTH" || r === "EAST") return Math.abs(magnitude);
  return magnitude; // no ref: the value is already signed (typical on Android)
}

/** A pair is usable only if both values are real numbers in range. Exact 0/0 is
 * rejected: it is the classic "missing GPS written as zero" sentinel, not Null
 * Island. Note 0 alone (e.g. longitude 0 in London) IS valid and kept. */
export function isUsableCoordinate(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Reads GPS out of an EXIF dictionary. Handles the iOS CGImageProperties shape
 * (`{GPS}` sub-dictionary with Latitude/LatitudeRef) and the flat Android shape
 * (GPSLatitude/GPSLatitudeRef at the top level). */
export function parseExifGps(exif: any): ExtractedLocation {
  if (!exif || typeof exif !== "object") return NO_LOCATION;
  const gps = exif["{GPS}"] ?? exif.GPS ?? exif.gps ?? exif;
  if (!gps || typeof gps !== "object") return NO_LOCATION;

  const rawLat = toFiniteNumber(gps.Latitude ?? gps.latitude ?? gps.GPSLatitude ?? exif.GPSLatitude);
  const rawLng = toFiniteNumber(gps.Longitude ?? gps.longitude ?? gps.GPSLongitude ?? exif.GPSLongitude);
  if (rawLat == null || rawLng == null) return NO_LOCATION;

  const lat = applyHemisphere(rawLat, gps.LatitudeRef ?? gps.GPSLatitudeRef ?? exif.GPSLatitudeRef);
  const lng = applyHemisphere(rawLng, gps.LongitudeRef ?? gps.GPSLongitudeRef ?? exif.GPSLongitudeRef);
  if (!isUsableCoordinate(lat, lng)) return NO_LOCATION;
  return { latitude: lat, longitude: lng, source: "exif" };
}

/** Full extraction for one asset: PHAsset location first, EXIF GPS as fallback. */
export function extractLocationFromAssetInfo(info: any): ExtractedLocation {
  if (!info || typeof info !== "object") return NO_LOCATION;

  const loc = info.location;
  if (loc && typeof loc === "object") {
    const lat = toFiniteNumber(loc.latitude);
    const lng = toFiniteNumber(loc.longitude);
    if (isUsableCoordinate(lat, lng)) {
      return { latitude: lat as number, longitude: lng as number, source: "asset_location" };
    }
  }

  return parseExifGps(info.exif);
}
