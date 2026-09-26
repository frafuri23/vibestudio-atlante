// Great-circle distance, antimeridian-safe. Zero is a valid coordinate — never use
// truthy checks (`if (lat)`) anywhere in this codebase; always check `!= null`.

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Normalizes a longitude delta so points on opposite sides of the antimeridian
 * (e.g. 179.9 and -179.9) are recognized as close, not ~360 degrees apart. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLonRad = toRad(dLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLonRad / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Quiz scoring: closer guesses score more. Deterministic, explained to the player.
 * This is a game mechanic, not a measure of photo location precision. */
export function placeGuessScore(distanceKm: number, scaleKm: number = 25): number {
  return Math.round(1000 * Math.exp(-distanceKm / scaleKm));
}

export function isValidCoordinate(lat: number | null, lon: number | null): lat is number {
  // Explicit null/undefined checks only — 0,0 (Gulf of Guinea) is a legitimate point.
  return lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
