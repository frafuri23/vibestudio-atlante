import seedrandom from "seedrandom";
import { PhotoAsset, PhotoOverride, QuizQuestion } from "../types";
import { isValidCoordinate, haversineKm, placeGuessScore } from "../geo/haversine";

export const YEAR_QUIZ_CHOICES = 4;
/** Distance scale of the place score: 1000 * e^(-km/scale). 150 km makes a guess in
 * the right region worth playing for (50 km = 716, 200 km = 264) instead of scoring
 * ~0 for anything that isn't pinpoint. */
export const PLACE_QUIZ_SCALE_KM = 150;
/** A place answer counts as "correct" (progress colour, stored outcome) from here. */
export const PLACE_CORRECT_POINTS = 500;
export const TARGET_SESSION_LENGTH = 5;

export function eligibleFor(mode: "place" | "year", photos: PhotoAsset[], overrides: Record<string, PhotoOverride>): PhotoAsset[] {
  return photos.filter((p) => {
    const ov = overrides[p.id];
    if (ov?.excludeFromApp || ov?.excludeFromQuiz) return false;
    if (p.mediaSubtype === "screenshot") return false; // excluded from default proposals
    if (mode === "place") return isValidCoordinate(p.latitude, p.longitude) || isValidCoordinate(ov?.manualLatitude ?? null, ov?.manualLongitude ?? null);
    if (mode === "year") return p.createdAt != null || ov?.manualDate != null;
    return false;
  });
}

/** Builds a session of up to TARGET_SESSION_LENGTH questions. Returns fewer if the
 * library doesn't have enough eligible photos — never pads with fake ones. */
export function buildQuizSession(
  mode: "place" | "year",
  photos: PhotoAsset[],
  overrides: Record<string, PhotoOverride>,
  seed: string,
): QuizQuestion[] {
  const rng = seedrandom(seed);
  const pool = eligibleFor(mode, photos, overrides);
  // Partial Fisher-Yates: picks TARGET_SESSION_LENGTH items in O(k) swaps instead of
  // sorting the whole pool (tens of thousands of photos) with a random comparator,
  // which is also biased. Deterministic for a given seed.
  const work = [...pool];
  const take = Math.min(TARGET_SESSION_LENGTH, work.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (work.length - i));
    const tmp = work[i];
    work[i] = work[j];
    work[j] = tmp;
  }
  const chosen = work.slice(0, take);

  return chosen.map((photo) => {
    if (mode === "place") {
      return { photoId: photo.id, kind: "place" as const };
    }
    const correctYear = new Date((overrides[photo.id]?.manualDate ?? photo.createdAt) as number).getFullYear();
    const years = new Set<number>([correctYear]);
    let guardCount = 0;
    while (years.size < YEAR_QUIZ_CHOICES && guardCount < 50) {
      const delta = Math.floor(rng() * 7) - 3;
      const candidate = correctYear + (delta === 0 ? 4 : delta);
      years.add(candidate);
      guardCount++;
    }
    const choices = Array.from(years).sort(() => rng() - 0.5);
    return { photoId: photo.id, kind: "year" as const, choices, correctIndex: choices.indexOf(correctYear) };
  });
}

export function scorePlaceGuess(guessLat: number, guessLon: number, actualLat: number, actualLon: number): { distanceKm: number; points: number } {
  const distanceKm = haversineKm(guessLat, guessLon, actualLat, actualLon);
  return { distanceKm, points: placeGuessScore(distanceKm, PLACE_QUIZ_SCALE_KM) };
}

export function scoreYearGuess(correct: boolean): number {
  return correct ? 1000 : 0;
}
