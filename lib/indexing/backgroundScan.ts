import { Platform } from "react-native";
import { getRepository } from "../db/repository";
import { getLocationPipelineVersion, getMode, LOCATION_PIPELINE_VERSION, setLocationPipelineVersion } from "../storage";
import { refreshSuggestedMemories } from "../memories/refresh";
import { IndexingCoordinator, isResumableJob } from "./coordinator";
import { isScanRunning, runExclusive, waitForScanIdle } from "./scanLock";
import { IndexJobStatus } from "../types";

/** iOS background continuation of a library scan the USER started.
 *
 * iOS decides when to wake the app (Background App Refresh, typically every 15+ min,
 * more often when the phone is charging on Wi-Fi, never guaranteed) and gives each
 * wake roughly 30 seconds. Each wake advances the saved checkpoint by a few small
 * pages and stops well before the limit, so the scan finishes over several wakes
 * even if the app is never reopened.
 *
 * It NEVER starts a new gallery read: it only runs when the persisted job is a
 * real-library scan still in phase "scanning" (started by the user, not paused),
 * and only while photo access is still granted. */
export const BACKGROUND_SCAN_TASK = "atlante-background-scan";

/** Stay well inside iOS's ~30 s window: a page that is still running when the window
 * closes is simply redone next time (its rows are committed with the cursor). */
const SLICE_BUDGET_MS = 20000;
/** Small pages so each checkpoint lands quickly inside the window. */
const SLICE_PAGE_SIZE = 25;
/** iOS treats this as a minimum, not a schedule. */
const MIN_INTERVAL_SECONDS = 15 * 60;

export type BackgroundScanAvailability = "available" | "denied" | "restricted" | "unavailable";

interface NativeModules {
  TaskManager: any;
  BackgroundFetch: any;
}

function loadModules(): NativeModules | null {
  if (Platform.OS === "web") return null;
  try {
    return {
      TaskManager: require("expo-task-manager"),
      BackgroundFetch: require("expo-background-fetch"),
    };
  } catch (e: any) {
    console.warn("[Atlante] background modules unavailable", e?.message ?? e);
    return null;
  }
}

/** Runs one bounded slice. Returns true when it made progress. */
export async function runBackgroundScanSlice(): Promise<boolean> {
  // iOS resumed an app whose foreground scan was mid-flight: that scan continues on
  // its own in this window, we just keep the task alive for it.
  if (isScanRunning()) {
    await waitForScanIdle(SLICE_BUDGET_MS);
    return true;
  }
  if ((await getMode()) !== "real") return false;

  const repo = await getRepository();
  const job = await repo.getIndexJob();
  if (!job || job.phase !== "scanning" || !isResumableJob(job, "real")) return false;

  const { NativePhotoLibraryAdapter } = require("../photoLibrary/nativeAdapter");
  const adapter = new NativePhotoLibraryAdapter();
  const permission = await adapter.getPermission();
  // Revoked access: leave the checkpoint untouched; the foreground shows the state.
  if (permission !== "granted_full" && permission !== "granted_limited") return false;

  const pipelineVersion = await getLocationPipelineVersion();
  const startedAt = Date.now();

  return runExclusive(async () => {
    // Re-check after acquiring: the foreground may have finished or paused meanwhile.
    const fresh = await repo.getIndexJob();
    if (!fresh || fresh.phase !== "scanning" || !isResumableJob(fresh, "real")) return false;
    const before = fresh.scanned;
    let finalStatus: IndexJobStatus | null = null;
    const coordinator = new IndexingCoordinator(adapter, repo);
    const collected = await coordinator.run(
      SLICE_PAGE_SIZE,
      (status) => {
        finalStatus = status;
      },
      "real",
      () => true,
      {
        reuseKnownMetadata: pipelineVersion >= LOCATION_PIPELINE_VERSION,
        shouldYield: () => Date.now() - startedAt > SLICE_BUDGET_MS,
      },
    );
    const phase = (finalStatus as IndexJobStatus | null)?.phase;
    if (phase === "completed") {
      await setLocationPipelineVersion(LOCATION_PIPELINE_VERSION);
      await refreshSuggestedMemories(repo, collected);
      return true;
    }
    return ((finalStatus as IndexJobStatus | null)?.scanned ?? before) > before;
  });
}

/** Must run at module scope on every JS launch (including a background launch). */
export function defineBackgroundScanTask(): void {
  const mods = loadModules();
  if (!mods) return;
  const { TaskManager, BackgroundFetch } = mods;
  try {
    if (TaskManager.isTaskDefined?.(BACKGROUND_SCAN_TASK)) return;
    TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
      try {
        const progressed = await runBackgroundScanSlice();
        return progressed ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (e: any) {
        console.warn("[Atlante] background scan slice failed", e?.message ?? e);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  } catch (e: any) {
    console.warn("[Atlante] could not define background task", e?.message ?? e);
  }
}

function mapStatus(BackgroundFetch: any, status: number | null): BackgroundScanAvailability {
  const S = BackgroundFetch.BackgroundFetchStatus ?? {};
  if (status === S.Available) return "available";
  if (status === S.Denied) return "denied";
  if (status === S.Restricted) return "restricted";
  return "unavailable";
}

/** Registers the wake-up with iOS (idempotent). Reads no photos by itself. */
export async function registerBackgroundScan(): Promise<BackgroundScanAvailability> {
  const mods = loadModules();
  if (!mods) return "unavailable";
  const { TaskManager, BackgroundFetch } = mods;
  try {
    const availability = mapStatus(BackgroundFetch, await BackgroundFetch.getStatusAsync());
    if (availability !== "available") return availability;
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SCAN_TASK, {
        minimumInterval: MIN_INTERVAL_SECONDS,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    return "available";
  } catch (e: any) {
    console.warn("[Atlante] background scan registration failed", e?.message ?? e);
    return "unavailable";
  }
}

export async function unregisterBackgroundScan(): Promise<void> {
  const mods = loadModules();
  if (!mods) return;
  try {
    if (await mods.TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK)) {
      await mods.BackgroundFetch.unregisterTaskAsync(BACKGROUND_SCAN_TASK);
    }
  } catch (e: any) {
    console.warn("[Atlante] background scan unregistration failed", e?.message ?? e);
  }
}
