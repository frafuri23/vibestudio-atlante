import { Place } from "../types";
import { haversineKm } from "./haversine";

const SAME_PLACE_RADIUS_KM = 1;

/** Looks for an already-named/confirmed Place near the given coordinate. No network
 * geocoder is wired in this release (plan §7: "se non disponibile, mostra 'Luogo da
 * nominare' e consenti un nome manuale") — resolution is local-only, from places the
 * user (or a previous manual naming) already created. Never invents a distant city
 * as if it were the exact spot. */
export function resolveNearbyPlace(lat: number, lon: number, places: Place[]): Place | null {
  let best: Place | null = null;
  let bestDist = Infinity;
  for (const p of places) {
    const d = haversineKm(lat, lon, p.latitude, p.longitude);
    if (d <= SAME_PLACE_RADIUS_KM && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

export function makeManualPlace(id: string, lat: number, lon: number, name: string): Place {
  return {
    id,
    latitude: lat,
    longitude: lon,
    level: "unresolved",
    name: name.trim() || null,
    provenance: "manual",
    confirmed: true,
  };
}
