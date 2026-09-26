// AsyncStorage-backed repository with the exact same contract as NativeSqliteRepository.
// Used on web (and as the demo-mode backend) because expo-sqlite's native storage does
// not execute in StackSail's react-native-web preview/website. See docs/DECISIONS.md.
// This really persists data across reloads (AsyncStorage is real in preview); it is a
// declared engine substitution, not a mocked "success".
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Repository } from "./repository";
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

const K = {
  overrides: "atlante.db.overrides",
  places: "atlante.db.places",
  memories: "atlante.db.memories",
  visits: "atlante.db.visits",
  photoAssets: "atlante.db.photoAssets",
  quizSessions: "atlante.db.quizSessions",
  quizQuestions: "atlante.db.quizQuestions",
  privateZones: "atlante.db.privateZones",
  shareDrafts: "atlante.db.shareDrafts",
  appSettings: "atlante.db.appSettings",
  indexJob: "atlante.db.indexJob",
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence failures are surfaced by the caller UI, never silently swallowed
    // into a false "saved" state.
  }
}

export class WebFallbackRepository implements Repository {
  backend: "web_async_storage_fallback" = "web_async_storage_fallback";

  async init(): Promise<void> {
    // Nothing to migrate — AsyncStorage documents are created lazily on first write.
  }

  async upsertOverride(o: PhotoOverride): Promise<void> {
    const all = await readJson<Record<string, PhotoOverride>>(K.overrides, {});
    all[o.photoId] = o;
    await writeJson(K.overrides, all);
  }

  async getOverride(photoId: string): Promise<PhotoOverride | null> {
    const all = await readJson<Record<string, PhotoOverride>>(K.overrides, {});
    return all[photoId] ?? null;
  }

  async listOverrides(): Promise<PhotoOverride[]> {
    const all = await readJson<Record<string, PhotoOverride>>(K.overrides, {});
    return Object.values(all);
  }

  async upsertPlace(p: Place): Promise<void> {
    const all = await readJson<Record<string, Place>>(K.places, {});
    all[p.id] = p;
    await writeJson(K.places, all);
  }

  async listPlaces(): Promise<Place[]> {
    const all = await readJson<Record<string, Place>>(K.places, {});
    return Object.values(all);
  }

  async upsertMemory(m: MemoryChapter): Promise<void> {
    const all = await readJson<Record<string, MemoryChapter>>(K.memories, {});
    all[m.id] = m;
    await writeJson(K.memories, all);
  }

  async listMemories(): Promise<MemoryChapter[]> {
    const all = await readJson<Record<string, MemoryChapter>>(K.memories, {});
    return Object.values(all);
  }

  async deleteMemory(id: string): Promise<void> {
    const all = await readJson<Record<string, MemoryChapter>>(K.memories, {});
    delete all[id];
    await writeJson(K.memories, all);
  }

  async upsertVisit(v: Visit): Promise<void> {
    const all = await readJson<Record<string, Visit>>(K.visits, {});
    all[v.id] = v;
    await writeJson(K.visits, all);
  }

  async listVisits(): Promise<Visit[]> {
    const all = await readJson<Record<string, Visit>>(K.visits, {});
    return Object.values(all);
  }

  async cachePhotoAssets(photos: PhotoAsset[]): Promise<void> {
    const all = await readJson<Record<string, PhotoAsset>>(K.photoAssets, {});
    for (const p of photos) all[p.id] = p;
    await writeJson(K.photoAssets, all);
  }

  async commitScanPage(pageAssets: PhotoAsset[], job: IndexJobStatus): Promise<void> {
    // Rows first, checkpoint second: an interruption between the two only means the
    // page is read again, never that it is skipped.
    await this.cachePhotoAssets(pageAssets);
    await this.setIndexJob(job);
  }

  async replacePhotoAssets(photos: PhotoAsset[], isDemo: boolean): Promise<void> {
    const all = await readJson<Record<string, PhotoAsset>>(K.photoAssets, {});
    for (const [id, asset] of Object.entries(all)) {
      if (asset.isDemo === isDemo) delete all[id];
    }
    for (const photo of photos) all[photo.id] = photo;
    await writeJson(K.photoAssets, all);
  }

  async pruneStalePhotoAssets(isDemo: boolean, minGeneration: number): Promise<void> {
    const all = await readJson<Record<string, PhotoAsset>>(K.photoAssets, {});
    let changed = false;
    for (const [id, asset] of Object.entries(all)) {
      if (asset.isDemo === isDemo && (asset.scanGeneration ?? 0) < minGeneration) {
        delete all[id];
        changed = true;
      }
    }
    if (changed) await writeJson(K.photoAssets, all);
  }

  async replaceSuggestions(chapters: MemoryChapter[], visits: Visit[]): Promise<void> {
    const memories = await readJson<Record<string, MemoryChapter>>(K.memories, {});
    const produced = new Set(chapters.map((c) => c.id));
    for (const [id, m] of Object.entries(memories)) {
      if (m.status === "suggested" && !m.userEdited && !produced.has(id)) delete memories[id];
    }
    for (const c of chapters) memories[c.id] = c;
    const visitMap: Record<string, Visit> = {};
    for (const v of visits) visitMap[v.id] = v;
    // Two writes total, instead of two full-document rewrites per chapter/visit.
    await writeJson(K.memories, memories);
    await writeJson(K.visits, visitMap);
  }

  async getCachedPhotoAssets(): Promise<PhotoAsset[]> {
    const all = await readJson<Record<string, PhotoAsset>>(K.photoAssets, {});
    return Object.values(all);
  }

  async upsertQuizSession(s: QuizSessionRecord): Promise<void> {
    const all = await readJson<Record<string, QuizSessionRecord>>(K.quizSessions, {});
    all[s.id] = s;
    await writeJson(K.quizSessions, all);
  }

  async getActiveQuizSession(): Promise<QuizSessionRecord | null> {
    const all = await readJson<Record<string, QuizSessionRecord>>(K.quizSessions, {});
    const inProgress = Object.values(all).filter((s) => s.status === "in_progress");
    if (inProgress.length === 0) return null;
    return inProgress.sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  async upsertQuizQuestion(q: QuizQuestionRecord): Promise<void> {
    const all = await readJson<Record<string, QuizQuestionRecord>>(K.quizQuestions, {});
    all[`${q.sessionId}::${q.photoId}`] = q;
    await writeJson(K.quizQuestions, all);
  }

  async listQuizQuestions(sessionId: string): Promise<QuizQuestionRecord[]> {
    const all = await readJson<Record<string, QuizQuestionRecord>>(K.quizQuestions, {});
    return Object.values(all).filter((q) => q.sessionId === sessionId);
  }

  async upsertPrivateZone(z: PrivateZone): Promise<void> {
    const all = await readJson<Record<string, PrivateZone>>(K.privateZones, {});
    all[z.id] = z;
    await writeJson(K.privateZones, all);
  }

  async listPrivateZones(): Promise<PrivateZone[]> {
    const all = await readJson<Record<string, PrivateZone>>(K.privateZones, {});
    return Object.values(all);
  }

  async deletePrivateZone(id: string): Promise<void> {
    const all = await readJson<Record<string, PrivateZone>>(K.privateZones, {});
    delete all[id];
    await writeJson(K.privateZones, all);
  }

  async upsertShareDraft(d: ShareDraftRecord): Promise<void> {
    const all = await readJson<Record<string, ShareDraftRecord>>(K.shareDrafts, {});
    all[d.id] = d;
    await writeJson(K.shareDrafts, all);
  }

  async listShareDrafts(): Promise<ShareDraftRecord[]> {
    const all = await readJson<Record<string, ShareDraftRecord>>(K.shareDrafts, {});
    return Object.values(all);
  }

  async getAppSettings(): Promise<AppSettingsRecord> {
    return readJson<AppSettingsRecord>(K.appSettings, { reduceMotionOverride: null, language: "it", demoDismissed: false });
  }

  async setAppSettings(patch: Partial<AppSettingsRecord>): Promise<AppSettingsRecord> {
    const current = await this.getAppSettings();
    const next = { ...current, ...patch };
    await writeJson(K.appSettings, next);
    return next;
  }

  async getIndexJob(): Promise<IndexJobStatus | null> {
    const job = await readJson<Partial<IndexJobStatus> | null>(K.indexJob, null);
    if (!job) return null;
    // Backward-compatible read for web sessions persisted before cursor checkpoints
    // and before the explicit permission field was added.
    return {
      phase: job.phase ?? "idle",
      scanned: typeof job.scanned === "number" ? job.scanned : 0,
      total: typeof job.total === "number" ? job.total : null,
      cursor: job.cursor ?? null,
      scanMode: job.scanMode === "demo" ? "demo" : "real",
      generation: typeof job.generation === "number" ? job.generation : 0,
      startGeneration: typeof job.startGeneration === "number" ? job.startGeneration : null,
      lastError: job.lastError ?? null,
      observedPermission: job.observedPermission ?? "unknown",
    };
  }

  async setIndexJob(job: IndexJobStatus): Promise<void> {
    await writeJson(K.indexJob, job);
  }

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(Object.values(K));
    } catch {}
  }
}
