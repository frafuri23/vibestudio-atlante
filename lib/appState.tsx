import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AppMode,
  AppSettingsRecord,
  IndexJobStatus,
  MemoryChapter,
  PermissionState,
  Place,
  PhotoAsset,
  PhotoOverride,
  PrivateZone,
  QuizQuestionRecord,
  QuizSessionRecord,
  ShareDraftRecord,
} from "./types";
import {
  getMode,
  setMode as persistMode,
  getOnboardingDone,
  setOnboardingDone as persistOnboardingDone,
  clearAllAppData,
  getLocationPipelineVersion,
  setLocationPipelineVersion,
  LOCATION_PIPELINE_VERSION,
  MEMORY_ENGINE_VERSION,
  getMemoryUpgradeVersion,
  setMemoryUpgradeVersion,
} from "./storage";
import { getRepository, Repository } from "./db/repository";
import { AppState as NativeAppState, Platform } from "react-native";
import { PhotoLibraryAdapter } from "./photoLibrary/adapterTypes";
import { DemoPhotoLibraryAdapter } from "./photoLibrary/demoAdapter";
import { WebUnavailablePhotoLibraryAdapter } from "./photoLibrary/webUnavailableAdapter";
import { IndexingCoordinator, isResumableJob } from "./indexing/coordinator";
import { refreshSuggestedMemories } from "./memories/refresh";
import { runExclusive } from "./indexing/scanLock";
import {
  BackgroundScanAvailability,
  registerBackgroundScan,
  unregisterBackgroundScan,
} from "./indexing/backgroundScan";

interface AppStateValue {
  ready: boolean;
  mode: AppMode;
  onboardingDone: boolean;
  permission: PermissionState;
  indexStatus: IndexJobStatus;
  photos: PhotoAsset[];
  overrides: Record<string, PhotoOverride>;
  memories: MemoryChapter[];
  places: Place[];
  privateZones: PrivateZone[];
  appSettings: AppSettingsRecord;
  repoBackend: Repository["backend"] | null;
  /** Set when a startup step failed or timed out. The app still starts (the UI must
   * never hang on a spinner); this string is shown so the failure is visible and
   * honest instead of silent. */
  bootError: string | null;
  /** True when the persisted photo metadata was produced by an older location
   * pipeline (which could not read GPS at all). The UI must offer an explicit
   * rescan — the app never re-reads the gallery on its own. */
  locationCacheStale: boolean;
  /** Whether iOS lets the scan continue in background (Background App Refresh). */
  backgroundScan: BackgroundScanAvailability;
  startDemo: () => Promise<void>;
  requestRealAccess: () => Promise<void>;
  refreshPermission: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  rescan: () => Promise<void>;
  cancelScan: () => void;
  setOverride: (o: PhotoOverride) => Promise<void>;
  upsertMemory: (m: MemoryChapter) => Promise<void>;
  upsertPlace: (p: Place) => Promise<void>;
  addPrivateZone: (z: PrivateZone) => Promise<void>;
  removePrivateZone: (id: string) => Promise<void>;
  updateAppSettings: (patch: Partial<AppSettingsRecord>) => Promise<void>;
  saveShareDraft: (d: ShareDraftRecord) => Promise<void>;
  // Quiz session persistence (plan §3, quiz_sessions/quiz_questions) — exposed so
  // QuizScreen can save + resume a session without reaching into the repository
  // directly (keeps the storage engine choice centralized here).
  saveQuizSession: (s: QuizSessionRecord) => Promise<void>;
  saveQuizQuestion: (q: QuizQuestionRecord) => Promise<void>;
  getActiveQuizSession: () => Promise<QuizSessionRecord | null>;
  listQuizQuestions: (sessionId: string) => Promise<QuizQuestionRecord[]>;
  wipeAppData: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

/** Max time any single startup step may take before the app gives up on it and boots
 * with a safe default. Without this, one storage/permission call that never settles
 * keeps the whole app on its loading indicator, which is indistinguishable from a
 * failed launch. NOTE: never write the word f-r-o-m immediately before a quoted
 * string in a comment — the dependency scanner reads it as an import specifier. */
const BOOT_STEP_TIMEOUT_MS = 4000;
/** Reading the cached photo metadata of a large library can legitimately take longer
 * than a settings row; timing it out made the app open empty, which looked exactly
 * like "the scan started over". */
const BOOT_CACHE_TIMEOUT_MS = 20000;

/** Awaits a startup promise but NEVER rejects and NEVER hangs: on error or timeout it
 * resolves to `fallback` and logs which step degraded (so a recurrence is diagnosable
 * from the app logs instead of guesswork). */
function bootStep<T>(promise: Promise<T>, fallback: T, label: string, ms: number = BOOT_STEP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      console.warn(`[Atlante] boot step timed out: ${label}`);
      finish(fallback);
    }, ms);
    promise.then(finish, (e: any) => {
      console.warn(`[Atlante] boot step failed: ${label}`, e?.message ?? e);
      finish(fallback);
    });
  });
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<AppMode>("demo");
  const [onboardingDone, setOnboardingDoneState] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [indexStatus, setIndexStatus] = useState<IndexJobStatus>({ phase: "idle", scanned: 0, total: null, cursor: null, scanMode: "demo", generation: 0, lastError: null, observedPermission: "unknown" });
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [overrides, setOverridesState] = useState<Record<string, PhotoOverride>>({});
  const [memories, setMemoriesState] = useState<MemoryChapter[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [privateZones, setPrivateZonesState] = useState<PrivateZone[]>([]);
  const [appSettings, setAppSettingsState] = useState<AppSettingsRecord>({ reduceMotionOverride: null, language: "it", demoDismissed: false });
  const [repoBackend, setRepoBackend] = useState<Repository["backend"] | null>(null);
  const [locationCacheStale, setLocationCacheStale] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [backgroundScan, setBackgroundScan] = useState<BackgroundScanAvailability>("unavailable");

  const repoRef = useRef<Repository | null>(null);
  const coordinatorRef = useRef<IndexingCoordinator | null>(null);
  const scanRunTokenRef = useRef(0);
  const activeScanRef = useRef<Promise<void> | null>(null);

  const adapterFor = useCallback((m: AppMode): PhotoLibraryAdapter => {
    if (m === "demo") return new DemoPhotoLibraryAdapter();
    // On web there is no photo library: use the explicit "unavailable" adapter and
    // never even load the native module (it can only run on a device build).
    if (Platform.OS === "web") return new WebUnavailablePhotoLibraryAdapter();
    try {
      // Lazily required so the native expo-media-library module is never evaluated on
      // web — its module-level code is not guaranteed safe to load in this preview.
      const { NativePhotoLibraryAdapter } = require("./photoLibrary/nativeAdapter");
      return new NativePhotoLibraryAdapter();
    } catch (e: any) {
      // A failed module load must degrade to "unavailable", not crash app startup.
      console.warn("[Atlante] native photo adapter unavailable", e?.message);
      return new WebUnavailablePhotoLibraryAdapter();
    }
  }, []);

  /** Returns the repository, retrying `getRepository()` once if the boot attempt
   * timed out. Without this a slow first init left `repoRef` null for the whole
   * session and every later action (scan, override, quiz save) silently did
   * nothing — the app looked alive but nothing ever happened. */
  const ensureRepository = useCallback(async (): Promise<Repository | null> => {
    if (repoRef.current) return repoRef.current;
    // getRepository() memoises its instance, so this is cheap when it did resolve.
    const repo = await bootStep<Repository | null>(getRepository(), null, "ensureRepository", 6000);
    if (repo) {
      repoRef.current = repo;
      setRepoBackend(repo.backend);
    }
    return repo;
  }, []);

  const runScan = useCallback(
    async (m: AppMode) => {
      const runToken = ++scanRunTokenRef.current;
      coordinatorRef.current?.cancel();
      // Finish the previous task before allowing this one to touch the repository.
      // This closes the window where an old page/finalization could overwrite the
      // new scan's index job or photo cache after cancellation.
      const previousScan = activeScanRef.current;
      if (previousScan) await previousScan;

      // runExclusive: never overlap with a background slice iOS may be running.
      const task = runExclusive(async () => {
        const isCurrent = () => scanRunTokenRef.current === runToken;
        const repo = await ensureRepository();
        if (!isCurrent()) return;
        if (!repo) {
          // Never fail silently: an unreachable storage engine is reported in the UI
          // instead of leaving an empty screen with no explanation.
          setIndexStatus((prev) => ({
            ...prev,
            phase: "error",
            lastError: "Archiviazione locale non disponibile: scansione non avviata.",
          }));
          return;
        }
        try {
          const adapter = adapterFor(m);
          const coordinator = new IndexingCoordinator(adapter, repo);
          coordinatorRef.current = coordinator;
          // Cached metadata written by an older GPS pipeline must be re-read, not reused.
          const pipelineVersion = m === "real" ? await getLocationPipelineVersion() : LOCATION_PIPELINE_VERSION;
          if (!isCurrent()) return;
          let finalPhase: IndexJobStatus["phase"] = "idle";
          // 100 per page keeps checkpoints frequent: a kill loses at most one page.
          const collected = await coordinator.run(m === "demo" ? 50 : 100, (status, current) => {
            if (!isCurrent()) return;
            finalPhase = status.phase;
            setIndexStatus(status);
            // While a rescan is still enumerating, keep the previous (larger) result on
            // screen instead of emptying the map and refilling it page by page. The
            // final emission (completed/cancelled/error) always wins, so deletions apply.
            // Never keep photos of the OTHER mode (demo must not stand in for real data).
            // current === null: only progress changed (throttled photo emission).
            if (current == null) return;
            setPhotos((prev) =>
              status.phase === "scanning" && current.length < prev.length && prev[0]?.isDemo === (m === "demo") ? prev : current,
            );
          }, m, isCurrent, {
            reuseKnownMetadata: pipelineVersion >= LOCATION_PIPELINE_VERSION,
            // Re-render map/timeline/memories with the growing list at most every
            // 1.5 s on a big library; the progress card still updates every page.
            photoEmitIntervalMs: m === "demo" ? 0 : 1500,
          });
          if (!isCurrent()) return;
          if (m === "real" && finalPhase === "completed") {
            // Only a complete enumeration proves that every asset was processed by
            // the current GPS pipeline. An error/cancel must keep the stale warning.
            await setLocationPipelineVersion(LOCATION_PIPELINE_VERSION);
            if (!isCurrent()) return;
            setLocationCacheStale(false);
          }
          if (!isCurrent()) return;
          // Recompute suggested memories + visits deterministically once the scan settles.
          if (!(await refreshSuggestedMemories(repo, collected, isCurrent))) return;
          setMemoriesState(await repo.listMemories());
        } catch (e: any) {
          if (!isCurrent()) return;
          // A scan failure must never look like "all photos disappeared" — surface it
          // as an explicit error phase instead of leaving stale/blank state.
          setIndexStatus((prev) => ({ ...prev, phase: "error", lastError: e?.message ?? "Errore durante la scansione." }));
        }
      });
      activeScanRef.current = task;
      try {
        await task;
      } finally {
        if (activeScanRef.current === task) activeScanRef.current = null;
      }
    },
    [adapterFor, ensureRepository],
  );

  useEffect(() => {
    let disposed = false;

    /** Adopts a repository instance and loads everything persisted in it, and reports
     * how many cached photos were restored. Shared by the normal boot path and by the
     * late-adoption path below, so a slow storage engine still ends up fully wired
     * instead of half-initialised. */
    const adoptRepository = async (repo: Repository, m: AppMode): Promise<{ restored: number; job: IndexJobStatus | null }> => {
      repoRef.current = repo;
      setRepoBackend(repo.backend);
      const [overridesList, memoriesList, placesList, zonesList, settings, job, cachedPhotos] = await Promise.all([
        bootStep(repo.listOverrides(), [] as PhotoOverride[], "listOverrides"),
        bootStep(repo.listMemories(), [] as MemoryChapter[], "listMemories"),
        bootStep(repo.listPlaces(), [] as Place[], "listPlaces"),
        bootStep(repo.listPrivateZones(), [] as PrivateZone[], "listPrivateZones"),
        bootStep(repo.getAppSettings(), { reduceMotionOverride: null, language: "it", demoDismissed: false } as AppSettingsRecord, "getAppSettings"),
        bootStep(repo.getIndexJob(), null as IndexJobStatus | null, "getIndexJob", BOOT_CACHE_TIMEOUT_MS),
        bootStep(repo.getCachedPhotoAssets(), [] as PhotoAsset[], "getCachedPhotoAssets", BOOT_CACHE_TIMEOUT_MS),
      ]);
      if (disposed) return { restored: 0, job: null };
      setOverridesState(Object.fromEntries(overridesList.map((o) => [o.photoId, o])));
      setMemoriesState(memoriesList);
      setPlaces(placesList);
      setPrivateZonesState(zonesList);
      setAppSettingsState(settings);
      // index_jobs has one row for both modes. Never show a real-library checkpoint
      // while the demo is active (or vice versa), otherwise the UI can display a
      // misleading progress state and offer the wrong resume path.
      if (job && job.scanMode === m) {
        // A "scanning" row on disk at launch means the previous process died mid-scan
        // (closed, killed by iOS, OTA reload). Nothing is running now, so show it as
        // paused instead of a scan that is "in progress" forever.
        setIndexStatus(job.phase === "scanning" ? { ...job, phase: "paused" } : job);
      } else {
        setIndexStatus({ phase: "idle", scanned: 0, total: null, cursor: null, scanMode: m, generation: 0, lastError: null, observedPermission: "unknown" });
      }
      // Restore the last scanned metadata cache immediately — this is reading a LOCAL
      // persisted cache (proves SQLite/AsyncStorage persistence across restart), not
      // a fresh gallery read: no automatic library access happens here.
      const restored = cachedPhotos.filter((p) => (m === "demo" ? p.isDemo : !p.isDemo));
      if (restored.length > 0) setPhotos(restored);
      // Memories written by the previous engine (no place names) are recomputed from
      // the LOCAL cache only — no gallery read. User-edited chapters are preserved.
      // Runs ONCE per engine version (persisted flag), never on every launch — a
      // repeated demo re-scan made the map empty out and refill after each relaunch.
      const upgradedTo = await bootStep(getMemoryUpgradeVersion(m), MEMORY_ENGINE_VERSION, "memoryUpgradeVersion");
      if (disposed) return { restored: 0, job: null };
      const needsUpgrade = upgradedTo < MEMORY_ENGINE_VERSION && restored.length > 0;
      if (needsUpgrade) {
        const staleMemories = memoriesList.some((mm) => !mm.userEdited && (mm.algorithmVersion ?? 1) < MEMORY_ENGINE_VERSION);
        if (m === "demo") {
          // The demo fixtures changed (place-matching images): re-run the synthetic scan once.
          const staleDemo = restored.some((p) => p.uri.includes("picsum.photos")) || staleMemories;
          void setMemoryUpgradeVersion(m, MEMORY_ENGINE_VERSION);
          if (staleDemo) return { restored: 0, job: null };
        } else if (staleMemories) {
          void refreshSuggestedMemories(repo, restored, () => !disposed)
            .then(async (ok) => {
              if (!ok || disposed) return;
              await setMemoryUpgradeVersion(m, MEMORY_ENGINE_VERSION);
              setMemoriesState(await repo.listMemories());
            })
            .catch((e: any) => console.warn("[Atlante] memory upgrade failed", e?.message ?? e));
        } else {
          void setMemoryUpgradeVersion(m, MEMORY_ENGINE_VERSION);
        }
      }
      // If those cached rows were written before the per-asset GPS read existed, their
      // "no location" is an artefact of the old code, not the truth about the photos.
      const pipelineVersion = await bootStep(getLocationPipelineVersion(), LOCATION_PIPELINE_VERSION, "pipelineVersion");
      const scopedJob = job && job.scanMode === m ? job : null;
      if (disposed) return { restored: restored.length, job: scopedJob };
      setLocationCacheStale(m === "real" && restored.length > 0 && pipelineVersion < LOCATION_PIPELINE_VERSION);
      return { restored: restored.length, job: scopedJob };
    };

    /** Continues a scan the user already started that was cut short by the app
     * closing, iOS terminating it, or an OTA reload (phase still "scanning" on disk).
     * This is not a new automatic gallery read: it finishes an enumeration the user
     * explicitly launched, only while access is still granted, from the saved cursor.
     * A scan the user paused/cancelled is NOT resumed on its own. */
    const resumeInterrupted = (m: AppMode, job: IndexJobStatus | null, p: PermissionState) => {
      if (disposed || !job || job.phase !== "scanning" || !isResumableJob(job, m)) return false;
      const granted = (["granted_full", "granted_limited"] as string[]).includes(p as string);
      if (m === "real" && !granted) return false;
      void runScan(m);
      return true;
    };

    /** Demo mode is built on synthetic fixtures, NOT on the photo library, so filling
     * it in automatically is allowed (the "no automatic gallery access" rule covers
     * the real library only) — and it is what keeps the demo from opening on an empty
     * map when nothing was cached yet, which read as "the app doesn't work". */
    const autoPopulateDemo = (m: AppMode, restoredCount: number) => {
      if (disposed || m !== "demo" || restoredCount > 0) return;
      void runScan("demo");
    };

    (async () => {
      let restoredCount = 0;
      let savedJob: IndexJobStatus | null = null;
      try {
        const m = await bootStep(getMode(), "demo" as AppMode, "getMode");
        const onboarded = await bootStep(getOnboardingDone(), false, "getOnboardingDone");
        if (disposed) return;
        setModeState(m);
        setOnboardingDoneState(onboarded);

        // Keep the original promise: if it only resolves AFTER the boot timeout we
        // still adopt it, otherwise repoRef would stay null for the whole session and
        // every later write (override, memory, quiz) would silently do nothing.
        const repoPromise = getRepository();
        const repo = await bootStep<Repository | null>(repoPromise, null, "getRepository");
        if (disposed) return;
        if (!repo) {
          setBootError("Archiviazione locale lenta a rispondere: i dati salvati non sono ancora stati caricati.");
          repoPromise.then(
            async (late) => {
              if (disposed || repoRef.current) return;
              console.warn("[Atlante] repository resolved after boot timeout — adopting it now");
              const late2 = await adoptRepository(late, m);
              if (disposed) return;
              setBootError(null);
              const lateAdapter = adapterFor(m);
              const lateP = await bootStep(lateAdapter.getPermission(), "unknown" as PermissionState, "getPermission(late)");
              if (!resumeInterrupted(m, late2.job, lateP)) autoPopulateDemo(m, late2.restored);
            },
            (e: any) => {
              if (disposed) return;
              console.error("[Atlante] repository unavailable", e?.message ?? e);
              setBootError("Archiviazione locale non disponibile: le modifiche di questa sessione non verranno salvate.");
            },
          );
        } else {
          const adopted = await adoptRepository(repo, m);
          restoredCount = adopted.restored;
          savedJob = adopted.job;
        }

        const adapter = adapterFor(m);
        const p = await bootStep(adapter.getPermission(), "unknown" as PermissionState, "getPermission");
        if (disposed) return;
        setPermission(p);
        if (m === "real") {
          // Registering only schedules iOS wake-ups; the task itself reads photos
          // only to continue a scan the user started (see backgroundScan.ts).
          void registerBackgroundScan().then((a) => {
            if (!disposed) setBackgroundScan(a);
          });
        }
        if (repo && !resumeInterrupted(m, savedJob, p)) autoPopulateDemo(m, restoredCount);
      } catch (e: any) {
        // Any unexpected startup failure is reported, never swallowed into a screen
        // that stays on the loading indicator forever.
        console.error("[Atlante] boot failed", e);
        if (!disposed) setBootError(e?.message ?? "Avvio non completato.");
      } finally {
        // CRITICAL: the app always reaches a rendered state. A hung or failing startup
        // step degrades to empty data + a visible message, not an endless spinner.
        if (!disposed) setReady(true);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [adapterFor, runScan]);

  // Onboarding must never block on the scan: it activates the chosen mode
  // immediately (fast, synchronous-ish state + a quick permission check) and lets
  // the scan run in the background, reported live via indexStatus on the Map screen.
  const startDemo = useCallback(async () => {
    await persistMode("demo");
    setModeState("demo");
    setPermission("granted_full");
    // Switching from an empty "real" session (e.g. on web, where the photo library
    // does not exist) must not keep showing that session's index status.
    setLocationCacheStale(false);
    setPhotos([]);
    void unregisterBackgroundScan();
    setBackgroundScan("unavailable");
    runScan("demo");
  }, [runScan]);

  const requestRealAccess = useCallback(async () => {
    await persistMode("real");
    setModeState("real");
    try {
      const adapter = adapterFor("real");
      const p = await adapter.requestPermission();
      setPermission(p);
      if (p === "granted_full" || p === "granted_limited") {
        void registerBackgroundScan().then(setBackgroundScan);
        runScan("real");
      }
    } catch (e) {
      setPermission("unknown");
    }
  }, [adapterFor, runScan]);

  const refreshPermission = useCallback(async () => {
    if (mode !== "real") return;
    try {
      const adapter = adapterFor("real");
      const nextPermission = await adapter.getPermission();
      setPermission(nextPermission);
      if (nextPermission === "denied" || nextPermission === "unknown") {
        coordinatorRef.current?.cancel();
        const nextStatus: IndexJobStatus = {
          ...indexStatus,
          phase: "awaiting_permission",
          observedPermission: nextPermission,
          lastError: "Il permesso alla libreria è cambiato. Controlla l'accesso e avvia una nuova scansione.",
        };
        setIndexStatus(nextStatus);
        await repoRef.current?.setIndexJob(nextStatus);
      }
    } catch {
      setPermission("unknown");
    }
  }, [adapterFor, indexStatus, mode]);

  /** After the app was in background, a background slice may have advanced (or
   * finished) the scan on disk. When nothing is running in this process, reload the
   * checkpoint + cached photos so the UI shows the real progress, and keep going
   * with a scan the user started that is still marked "scanning". */
  const syncAfterBackground = useCallback(async () => {
    if (mode !== "real" || activeScanRef.current) return;
    const repo = repoRef.current;
    if (!repo) return;
    try {
      const [job, cached] = await Promise.all([repo.getIndexJob(), repo.getCachedPhotoAssets()]);
      if (activeScanRef.current) return;
      const real = cached.filter((p) => !p.isDemo);
      if (real.length > 0) setPhotos(real);
      if (job && job.scanMode === "real") {
        setIndexStatus(job);
        if (job.phase === "completed") {
          setMemoriesState(await repo.listMemories());
          if ((await getLocationPipelineVersion()) >= LOCATION_PIPELINE_VERSION) setLocationCacheStale(false);
        }
        const p = await adapterFor("real").getPermission();
        const granted = p === "granted_full" || p === "granted_limited";
        if (granted && job.phase === "scanning" && isResumableJob(job, "real")) void runScan("real");
      }
    } catch (e: any) {
      console.warn("[Atlante] sync after background failed", e?.message ?? e);
    }
  }, [adapterFor, mode, runScan]);

  useEffect(() => {
    if (mode !== "real") return;
    const subscription = NativeAppState.addEventListener("change", (nextState) => {
      // Returning to foreground refreshes permission, then picks up progress made in
      // background. It never starts a NEW gallery read on its own.
      if (nextState === "active") {
        void refreshPermission().then(() => syncAfterBackground());
        void registerBackgroundScan().then(setBackgroundScan);
      }
    });
    return () => subscription.remove();
  }, [mode, refreshPermission, syncAfterBackground]);

  const completeOnboarding = useCallback(async () => {
    await persistOnboardingDone();
    setOnboardingDoneState(true);
  }, []);

  const rescan = useCallback(async () => runScan(mode), [mode, runScan]);
  const cancelScan = useCallback(() => coordinatorRef.current?.cancel(), []);

  const setOverride = useCallback(async (o: PhotoOverride) => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.upsertOverride(o);
    setOverridesState((prev) => ({ ...prev, [o.photoId]: o }));
  }, []);

  const upsertMemory = useCallback(async (m: MemoryChapter) => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.upsertMemory(m);
    setMemoriesState(await repo.listMemories());
  }, []);

  const upsertPlace = useCallback(async (p: Place) => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.upsertPlace(p);
    setPlaces(await repo.listPlaces());
  }, []);

  const addPrivateZone = useCallback(async (z: PrivateZone) => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.upsertPrivateZone(z);
    setPrivateZonesState(await repo.listPrivateZones());
  }, []);

  const removePrivateZone = useCallback(async (id: string) => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.deletePrivateZone(id);
    setPrivateZonesState(await repo.listPrivateZones());
  }, []);

  const updateAppSettings = useCallback(async (patch: Partial<AppSettingsRecord>) => {
    const repo = repoRef.current;
    if (!repo) return;
    setAppSettingsState(await repo.setAppSettings(patch));
  }, []);

  const saveShareDraft = useCallback(async (d: ShareDraftRecord) => {
    await repoRef.current?.upsertShareDraft(d);
  }, []);

  const saveQuizSession = useCallback(async (s: QuizSessionRecord) => {
    await repoRef.current?.upsertQuizSession(s);
  }, []);
  const saveQuizQuestion = useCallback(async (q: QuizQuestionRecord) => {
    await repoRef.current?.upsertQuizQuestion(q);
  }, []);
  const getActiveQuizSession = useCallback(async () => (await repoRef.current?.getActiveQuizSession()) ?? null, []);
  const listQuizQuestions = useCallback(async (sessionId: string) => (await repoRef.current?.listQuizQuestions(sessionId)) ?? [], []);

  const wipeAppData = useCallback(async () => {
    const repo = repoRef.current;
    await clearAllAppData();
    await repo?.clearAll();
    void unregisterBackgroundScan();
    setBackgroundScan("unavailable");
    setPhotos([]);
    setOverridesState({});
    setMemoriesState([]);
    setPlaces([]);
    setPrivateZonesState([]);
    setAppSettingsState({ reduceMotionOverride: null, language: "it", demoDismissed: false });
    setLocationCacheStale(false);
    setIndexStatus({ phase: "idle", scanned: 0, total: null, cursor: null, scanMode: "demo", generation: 0, lastError: null, observedPermission: "unknown" });
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      mode,
      onboardingDone,
      permission,
      indexStatus,
      photos,
      overrides,
      memories,
      places,
      privateZones,
      appSettings,
      repoBackend,
      bootError,
      locationCacheStale,
      backgroundScan,
      startDemo,
      requestRealAccess,
      refreshPermission,
      completeOnboarding,
      rescan,
      cancelScan,
      setOverride,
      upsertMemory,
      upsertPlace,
      addPrivateZone,
      removePrivateZone,
      updateAppSettings,
      saveShareDraft,
      saveQuizSession,
      saveQuizQuestion,
      getActiveQuizSession,
      listQuizQuestions,
      wipeAppData,
    }),
    [
      ready, mode, onboardingDone, permission, indexStatus, photos, overrides, memories, places, privateZones,
      appSettings, repoBackend, bootError, locationCacheStale, backgroundScan, startDemo, requestRealAccess, refreshPermission, completeOnboarding, rescan, cancelScan, setOverride,
      upsertMemory, upsertPlace, addPrivateZone, removePrivateZone, updateAppSettings, saveShareDraft,
      saveQuizSession, saveQuizQuestion, getActiveQuizSession, listQuizQuestions, wipeAppData,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
