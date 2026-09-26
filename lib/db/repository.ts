import { Platform } from "react-native";
import {
  AppSettingsRecord,
  IndexJobStatus,
  MemoryChapter,
  Place,
  PhotoAsset,
  PhotoOverride,
  PrivateZone,
  QuizQuestionRecord,
  QuizSessionRecord,
  ShareDraftRecord,
  Visit,
} from "../types";
import { WebFallbackRepository } from "./webFallback";

export interface Repository {
  init(): Promise<void>;
  upsertOverride(o: PhotoOverride): Promise<void>;
  getOverride(photoId: string): Promise<PhotoOverride | null>;
  listOverrides(): Promise<PhotoOverride[]>;
  upsertPlace(p: Place): Promise<void>;
  listPlaces(): Promise<Place[]>;
  upsertMemory(m: MemoryChapter): Promise<void>;
  listMemories(): Promise<MemoryChapter[]>;
  deleteMemory(id: string): Promise<void>;
  getIndexJob(): Promise<IndexJobStatus | null>;
  setIndexJob(job: IndexJobStatus): Promise<void>;
  // photo_assets — a metadata-only cache of the last successful scan (plan §3).
  // Never stores image bytes; just enough to redraw the map/timeline instantly on
  // next open without a fresh gallery read (which stays a manual "Aggiorna scansione").
  cachePhotoAssets(photos: PhotoAsset[]): Promise<void>;
  /** Persists ONE scanned page and its checkpoint together (a single transaction on
   * SQLite), so after a kill/OTA reload the cursor never points past rows that were
   * not written, and each page costs only its own rows (not the whole library). */
  commitScanPage(pageAssets: PhotoAsset[], job: IndexJobStatus): Promise<void>;
  /** Replaces only one scan scope after a completed enumeration. */
  replacePhotoAssets(photos: PhotoAsset[], isDemo: boolean): Promise<void>;
  /** After a completed enumeration: deletes rows of one scope that the enumeration
   * did not confirm (scanGeneration below `minGeneration`), i.e. assets removed
   * from the library. Cheap on large libraries: nothing else is rewritten. */
  pruneStalePhotoAssets(isDemo: boolean, minGeneration: number): Promise<void>;
  /** Persists a full recompute of suggested memories + visits in ONE batch (one
   * transaction on SQLite). Suggested, never-edited chapters that are no longer
   * produced (their photos were deleted or regrouped) are removed; user-edited,
   * confirmed and dismissed chapters are always kept. */
  replaceSuggestions(chapters: MemoryChapter[], visits: Visit[]): Promise<void>;
  getCachedPhotoAssets(): Promise<PhotoAsset[]>;
  // visits (plan §3)
  upsertVisit(v: Visit): Promise<void>;
  listVisits(): Promise<Visit[]>;
  // quiz_sessions / quiz_questions (plan §3)
  upsertQuizSession(s: QuizSessionRecord): Promise<void>;
  getActiveQuizSession(): Promise<QuizSessionRecord | null>;
  upsertQuizQuestion(q: QuizQuestionRecord): Promise<void>;
  listQuizQuestions(sessionId: string): Promise<QuizQuestionRecord[]>;
  // private_zones (plan §3)
  upsertPrivateZone(z: PrivateZone): Promise<void>;
  listPrivateZones(): Promise<PrivateZone[]>;
  deletePrivateZone(id: string): Promise<void>;
  // share_drafts (plan §3)
  upsertShareDraft(d: ShareDraftRecord): Promise<void>;
  listShareDrafts(): Promise<ShareDraftRecord[]>;
  // app_settings (plan §3) — a single settings row.
  getAppSettings(): Promise<AppSettingsRecord>;
  setAppSettings(patch: Partial<AppSettingsRecord>): Promise<AppSettingsRecord>;
  clearAll(): Promise<void>;
  /** Which storage engine is actually backing this instance — surfaced in
   * Settings/Diagnostics so the app never silently pretends native SQLite ran. */
  backend: "native_sqlite" | "web_async_storage_fallback";
}

let cached: Repository | null = null;
let pending: Promise<Repository> | null = null;

/** Chooses the real SQLite-backed repository on native platforms, and an
 * AsyncStorage-backed one with the identical contract on web (where expo-sqlite's
 * native storage cannot run inside StackSail's react-native-web preview/website).
 * See docs/DECISIONS.md — this is a declared compatibility adapter, not fabricated
 * behavior: both implementations really persist data, just via different engines.
 * The native SQLite module is imported lazily (only on native) so its web-facing
 * bundle code — which some expo-sqlite versions load eagerly for a browser worker —
 * never has a chance to run inside this web-only preview. */
export async function getRepository(): Promise<Repository> {
  if (cached) return cached;
  // Concurrent callers (boot + a scan) share ONE init attempt, and the instance is
  // cached only after init succeeded. Previously it was cached before init, so a
  // failed migration left every later call with a half-initialised database.
  if (!pending) {
    pending = (async () => {
      let repo: Repository;
      if (Platform.OS === "web") {
        repo = new WebFallbackRepository();
      } else {
        const { NativeSqliteRepository } = require("./nativeSqlite");
        repo = new NativeSqliteRepository();
      }
      await repo.init();
      cached = repo;
      return repo;
    })();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
