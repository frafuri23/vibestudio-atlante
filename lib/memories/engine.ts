import { PhotoAsset, MemoryChapter, PhotoOverride, Visit as VisitRecord } from "../types";
import { haversineKm, isValidCoordinate } from "../geo/haversine";
import { dominantCity } from "../geo/cityIndex";

// Deterministic clustering — NOT an AI/ML model, just a distance+time heuristic. The
// thresholds below are product assumptions to tune, not scientifically validated
// figures (see plan §8). Every output is labeled "suggested", never a verified trip.

const VISIT_RADIUS_KM = 0.5;
const VISIT_MAX_GAP_HOURS = 6;
const CHAPTER_GAP_HOURS = 48;
const CHAPTER_MAX_SPAN_DAYS = 21;

interface Visit {
  photoIds: string[];
  startAt: number;
  endAt: number;
  latitude: number | null;
  longitude: number | null;
}

export interface SuggestedMemoriesResult {
  chapters: MemoryChapter[];
  /** The short spatial+temporal "visits" (plan §3, visits/visit_photos) that fed the
   * chapter grouping — persisted separately from chapters so a place can later
   * collect several distinct visits without merging them into one trip. */
  visits: VisitRecord[];
}

function effectiveCoords(photo: PhotoAsset, override: PhotoOverride | undefined): { lat: number | null; lon: number | null } {
  if (override && isValidCoordinate(override.manualLatitude, override.manualLongitude)) {
    return { lat: override.manualLatitude, lon: override.manualLongitude };
  }
  return { lat: photo.latitude, lon: photo.longitude };
}

function effectiveDate(photo: PhotoAsset, override: PhotoOverride | undefined): number | null {
  if (override?.manualDate != null) return override.manualDate;
  return photo.createdAt;
}

/** Groups time-ordered, geotagged photos into short "visits" by spatial+temporal
 * proximity, then groups nearby visits (and non-geotagged runs) into candidate
 * "chapters". Deterministic given the same input + overrides. */
export function buildSuggestedMemories(
  photos: PhotoAsset[],
  overrides: Record<string, PhotoOverride>,
  existing: MemoryChapter[],
): SuggestedMemoriesResult {
  const usable = photos
    .filter((p) => !overrides[p.id]?.excludeFromApp)
    .map((p) => ({ photo: p, date: effectiveDate(p, overrides[p.id]), coords: effectiveCoords(p, overrides[p.id]) }))
    .filter((x) => x.date != null)
    .sort((a, b) => (a.date as number) - (b.date as number));

  // Step 1: build visits from geotagged photos only.
  const visits: Visit[] = [];
  for (const item of usable) {
    if (!isValidCoordinate(item.coords.lat, item.coords.lon)) continue;
    const last = visits[visits.length - 1];
    const hoursSinceLast = last ? ((item.date as number) - last.endAt) / 3600000 : Infinity;
    const distanceKm = last && last.latitude != null && last.longitude != null
      ? haversineKm(last.latitude, last.longitude, item.coords.lat as number, item.coords.lon as number)
      : Infinity;
    if (last && hoursSinceLast <= VISIT_MAX_GAP_HOURS && distanceKm <= VISIT_RADIUS_KM) {
      last.photoIds.push(item.photo.id);
      last.endAt = item.date as number;
    } else {
      visits.push({
        photoIds: [item.photo.id],
        startAt: item.date as number,
        endAt: item.date as number,
        latitude: item.coords.lat,
        longitude: item.coords.lon,
      });
    }
  }

  // O(1) lookups for preserved chapters (was a linear find per chapter).
  const existingById = new Map<string, MemoryChapter>();
  const editedByFirstPhoto = new Map<string, MemoryChapter>();
  for (const m of existing) {
    existingById.set(m.id, m);
    if (m.userEdited && m.photoIds.length) editedByFirstPhoto.set(m.photoIds[0], m);
  }

  // Step 2: group visits separated by less than CHAPTER_GAP_HOURS into chapters,
  // capped at CHAPTER_MAX_SPAN_DAYS so an every-day home city doesn't become one
  // months-long "trip".
  const chapters: MemoryChapter[] = [];
  let current: Visit[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const allPhotoIds = current.flatMap((v) => v.photoIds);
    const start = current[0].startAt;
    const end = current[current.length - 1].endAt;
    const id = `memory-${start}-${allPhotoIds[0]}`;
    // Offline, approximate naming from the bundled city index (never a network call).
    const city = dominantCity(current.map((v) => ({ lat: v.latitude, lon: v.longitude })));
    const byId = existingById.get(id);
    const existingMatch = byId?.userEdited ? byId : editedByFirstPhoto.get(allPhotoIds[0]) ?? byId;
    if (existingMatch?.userEdited) {
      chapters.push(existingMatch);
    } else {
      chapters.push({
        id,
        title: templateTitle(start, city?.name ?? null),
        periodStart: start,
        periodEnd: end,
        coverPhotoId: allPhotoIds[0],
        origin: "suggested",
        status: "suggested",
        userEdited: false,
        algorithmVersion: 2,
        photoIds: allPhotoIds,
        placeName: city?.name ?? null,
      });
    }
    current = [];
  };

  for (const v of visits) {
    if (current.length === 0) {
      current.push(v);
      continue;
    }
    const prev = current[current.length - 1];
    const gapHours = (v.startAt - prev.endAt) / 3600000;
    const spanDays = (v.endAt - current[0].startAt) / 86400000;
    if (gapHours <= CHAPTER_GAP_HOURS && spanDays <= CHAPTER_MAX_SPAN_DAYS) {
      current.push(v);
    } else {
      flush();
      current.push(v);
    }
  }
  flush();

  const visitRecords: VisitRecord[] = visits.map((v, i) => ({
    id: `visit-${v.startAt}-${v.photoIds[0]}`,
    placeId: null,
    startAt: v.startAt,
    endAt: v.endAt,
    status: "suggested",
    algorithmVersion: 1,
    photoIds: v.photoIds,
  }));

  return { chapters, visits: visitRecords };
}

// Fixed Italian month names: Intl date formatting is slow on Hermes and was called
// once per chapter (thousands on a big library).
const MONTHS_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function templateTitle(startMs: number, placeName: string | null): string {
  const d = new Date(startMs);
  const month = MONTHS_IT[d.getMonth()];
  const year = d.getFullYear();
  if (placeName) return `${placeName}, ${month} ${year}`;
  return `Ricordi di ${month} ${year}`;
}
