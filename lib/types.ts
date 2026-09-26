// Shared domain types — mirrors the data model in docs/IMPLEMENTATION_PLAN.md.

export type PermissionState =
  | "unknown"
  | "granted_full"
  | "granted_limited"
  | "denied"
  | "unavailable_in_preview"; // native module cannot run in this runtime

export type LocationSource = "original_metadata" | "manual_override" | "none";

export interface PhotoAsset {
  id: string; // internal id, stable
  libraryAssetId: string; // library-local id (never shared across devices)
  createdAt: number | null; // epoch ms, original capture date if known
  modifiedAt: number | null;
  width: number;
  height: number;
  latitude: number | null; // null = unknown. 0 is a VALID coordinate, never use truthy checks.
  longitude: number | null;
  locationSource: LocationSource;
  mediaSubtype: "photo" | "screenshot" | "livePhotoStill" | "panorama";
  cloudAvailability: "local" | "cloud_pending" | "unknown";
  uri: string; // local uri or demo remote uri
  isDemo: boolean;
  /** "stato metadati" (plan §3, photo_assets). Currently always "ok" once a page
   * enumerates successfully — the adapters don't yet report per-asset metadata
   * failures distinctly; documented as a known limitation in docs/DECISIONS.md. */
  metadataStatus: "ok" | "unavailable" | "error";
  /** "generazione di scansione" (plan §3) — the IndexingCoordinator generation that
   * produced/last-confirmed this row, used to detect stale cache entries. */
  scanGeneration: number;
}

export interface PhotoOverride {
  photoId: string;
  manualLatitude: number | null;
  manualLongitude: number | null;
  manualDate: number | null;
  excludeFromApp: boolean;
  excludeFromQuiz: boolean;
  excludeFromSharing: boolean;
  favoriteLocal: boolean;
}

export interface Place {
  id: string;
  latitude: number;
  longitude: number;
  level: "city" | "region" | "country" | "unresolved";
  name: string | null; // null = "Luogo da nominare"
  provenance: "geocoder" | "manual" | "unresolved";
  confirmed: boolean;
}

export interface Visit {
  id: string;
  placeId: string | null;
  startAt: number;
  endAt: number;
  status: "suggested" | "confirmed";
  algorithmVersion: number;
  photoIds: string[];
}

export interface MemoryChapter {
  id: string;
  title: string;
  periodStart: number | null;
  periodEnd: number | null;
  coverPhotoId: string | null;
  origin: "suggested" | "manual";
  status: "suggested" | "confirmed" | "dismissed";
  userEdited: boolean;
  algorithmVersion: number;
  photoIds: string[];
  placeName: string | null;
}

export type IndexPhase =
  | "idle"
  | "awaiting_permission"
  | "scanning"
  | "paused"
  | "completed"
  | "cancelled"
  | "error"
  | "unavailable_in_preview";

export interface IndexJobStatus {
  phase: IndexPhase;
  scanned: number;
  total: number | null; // null = unknown denominator, never fake a percentage
  /** Cursor of the last fully persisted page. Null means start from the first page. */
  cursor: string | null;
  /** Prevents resuming a demo checkpoint as a real-library scan. */
  scanMode: AppMode;
  generation: number;
  /** Generation at which the CURRENT enumeration started (kept across resumes).
   * Cached rows with scanGeneration >= this value were already confirmed by this
   * enumeration; older rows still need re-confirming. Null/absent = unknown (legacy
   * checkpoint) or no enumeration in progress. */
  startGeneration?: number | null;
  lastError: string | null;
  /** "permessi osservati" (plan §3, index_jobs) — the permission the coordinator
   * actually observed when this job ran, so a UI/log can tell a denied-permission
   * stop apart from a genuine enumeration error. */
  observedPermission: PermissionState;
}

export interface QuizQuestion {
  photoId: string;
  kind: "place" | "year";
  choices?: number[]; // for "year" mode
  correctIndex?: number;
}

export interface QuizSessionResult {
  answered: number;
  totalPoints: number;
  maxPoints: number;
}

export interface QuizSessionRecord {
  id: string;
  mode: "place" | "year";
  seed: string;
  status: "in_progress" | "completed";
  questionIndex: number;
  score: number;
  createdAt: number;
  completedAt: number | null;
}

export interface QuizQuestionRecord {
  sessionId: string;
  photoId: string;
  kind: "place" | "year";
  choices: number[] | null; // null for "place" mode (no fixed alternatives)
  correctIndex: number | null;
  givenIndex: number | null; // null until answered
  outcome: "correct" | "incorrect" | null;
}

export interface PrivateZone {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  /** "ambito condivisione/tutta-app" (plan §3). */
  scope: "sharing_only" | "whole_app";
  label: string | null;
}

export interface ShareDraftRecord {
  id: string;
  format: "travel" | "quizResult";
  selectedPhotoIds: string[];
  precisionSettings: { preciseDate: boolean; preciseLocation: boolean };
  title: string;
  status: "draft" | "approved" | "cancelled";
  approvedRevision: number | null; // epoch ms of the approved export, or null
}

export interface AppSettingsRecord {
  reduceMotionOverride: boolean | null; // null = follow the OS setting
  language: string;
  demoDismissed: boolean;
}

export type AppMode = "demo" | "real";
