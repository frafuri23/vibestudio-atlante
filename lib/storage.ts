import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppMode } from "./types";

const KEYS = {
  mode: "atlante.mode",
  onboardingDone: "atlante.onboardingDone",
  locationPipelineVersion: "atlante.locationPipelineVersion",
  memoryUpgradeVersion: "atlante.memoryUpgradeVersion",
};

/** Memory-engine version whose one-time upgrade (demo refresh / recompute from the
 * local cache) already ran. Stops the upgrade from re-running on every launch. */
export const MEMORY_ENGINE_VERSION = 2;

export async function getMemoryUpgradeVersion(mode: AppMode): Promise<number> {
  try {
    const n = Number(await AsyncStorage.getItem(`${KEYS.memoryUpgradeVersion}.${mode}`));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function setMemoryUpgradeVersion(mode: AppMode, v: number): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEYS.memoryUpgradeVersion}.${mode}`, String(v));
  } catch {}
}

/** Bumped whenever the way coordinates are read from the photo library changes.
 * v1 = list-call only (never returned GPS: every photo looked "senza posizione").
 * v2 = per-asset getAssetInfoAsync + EXIF GPS fallback.
 * Cached photo metadata written by an OLDER version can't be trusted for location,
 * so the app asks for an explicit rescan instead of showing stale "no location". */
export const LOCATION_PIPELINE_VERSION = 2;

export async function getLocationPipelineVersion(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(KEYS.locationPipelineVersion);
    const n = v == null ? 0 : Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function setLocationPipelineVersion(v: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.locationPipelineVersion, String(v));
  } catch {}
}

export async function getMode(): Promise<AppMode> {
  try {
    const v = await AsyncStorage.getItem(KEYS.mode);
    return v === "real" ? "real" : "demo";
  } catch {
    return "demo";
  }
}

export async function setMode(mode: AppMode): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.mode, mode);
  } catch {
    // Storage failures must never crash the app; the caller keeps its previous state.
  }
}

export async function getOnboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEYS.onboardingDone)) === "1";
  } catch {
    return false;
  }
}

export async function setOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.onboardingDone, "1");
  } catch {}
}

// Private zones now live in the Repository (SQLite on native, the equivalent
// AsyncStorage-backed contract on web) — see lib/db/repository.ts and lib/types.ts
// for the canonical PrivateZone shape. They are exposed to screens via
// useAppState().privateZones / addPrivateZone / removePrivateZone.

/** Clears everything Atlante stored locally outside the Repository (mode +
 * onboarding flag). The Repository's own clearAll() wipes the rest. Does NOT touch
 * the system photo library — original photos are never deleted or modified by this
 * app. */
export async function clearAllAppData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      ...Object.values(KEYS),
      `${KEYS.memoryUpgradeVersion}.demo`,
      `${KEYS.memoryUpgradeVersion}.real`,
    ]);
  } catch {}
}
