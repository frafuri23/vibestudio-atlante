import { PhotoAsset } from "../types";

// Synthetic demo dataset — clearly separate from real gallery data. Used only when
// app_settings.mode === 'demo', or as the automatic fallback where the native photo
// library module cannot run (the web/preview runtime). Every screen that reads this
// must show a "Demo" badge — see components/DemoBadge.tsx.
const day = 86400000;
const now = Date.now();

// Demo images deliberately match the place each synthetic photo claims to be in
// (a "Roma" photo really shows Rome), so the demo never reads as random stock.
const ASSET = "https://appspawn-gateway-production.up.railway.app/v1/assets/fe29a326-def4-5c43-a6aa-328450620f9b/";
const IMG: Record<string, string> = {
  "roma-1": "demo-roma-1.png",
  "roma-2": "demo-roma-2.png",
  "roma-3": "demo-roma-1.png",
  "roma-4": "demo-roma-2.png",
  "lisbona-1": "demo-lisbona-1.png",
  "lisbona-2": "demo-lisbona-2.png",
  "lisbona-3": "demo-lisbona-1.png",
  "citta-1": "demo-milano-1.png",
  "citta-2": "demo-milano-2.png",
  "citta-3": "demo-milano-1.png",
  "citta-4": "demo-milano-2.png",
  "fiji-1": "demo-fiji.png",
  "fiji-2": "demo-fiji.png",
  "zero-1": "demo-oceano.png",
  "senza-posizione-1": "demo-casa.png",
  "senza-posizione-2": "demo-casa.png",
};

function photo(
  id: string,
  daysAgo: number,
  lat: number | null,
  lon: number | null,
  subtype: PhotoAsset["mediaSubtype"] = "photo",
): PhotoAsset {
  return {
    id: `demo-${id}`,
    libraryAssetId: `demo-lib-${id}`,
    createdAt: now - daysAgo * day,
    modifiedAt: now - daysAgo * day,
    width: 1536,
    height: 1024,
    latitude: lat,
    longitude: lon,
    locationSource: lat != null ? "original_metadata" : "none",
    mediaSubtype: subtype,
    cloudAvailability: "local",
    uri: IMG[id] ? ASSET + IMG[id] : `https://picsum.photos/seed/atlante-${id}/800/600`,
    isDemo: true,
    metadataStatus: "ok",
    scanGeneration: 0,
  };
}

export const demoPhotos: PhotoAsset[] = [
  // Rome weekend — a chapter with clear spatial+temporal clustering.
  photo("roma-1", 620, 41.8902, 12.4922),
  photo("roma-2", 620, 41.9009, 12.4833),
  photo("roma-3", 619, 41.8955, 12.4823),
  photo("roma-4", 619, 41.8919, 12.4735, "screenshot"),
  // Lisbon trip, different year.
  photo("lisbona-1", 300, 38.7223, -9.1393),
  photo("lisbona-2", 300, 38.7139, -9.1394),
  photo("lisbona-3", 299, 38.7071, -9.1355),
  // Same home city, revisited many times across a year — should NOT collapse into one trip.
  photo("citta-1", 200, 45.4642, 9.19),
  photo("citta-2", 140, 45.4642, 9.19),
  photo("citta-3", 80, 45.4643, 9.1901),
  photo("citta-4", 20, 45.4641, 9.1899),
  // Antimeridian edge case — Fiji, points on opposite sides of +/-180.
  photo("fiji-1", 90, -17.7134, 178.065),
  photo("fiji-2", 90, -17.71, -179.98),
  // Zero-coordinate edge case (Gulf of Guinea) — must render as a valid point, not "unknown".
  photo("zero-1", 45, 0, 0),
  // No location at all.
  photo("senza-posizione-1", 10, null, null),
  photo("senza-posizione-2", 5, null, null, "screenshot"),
];
