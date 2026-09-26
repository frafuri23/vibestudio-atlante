// Real expo-media-library adapter. Only meaningfully exercised on a native build —
// see docs/NATIVE_CAPABILITIES.md for what has and hasn't been verified.
import { Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { PhotoLibraryAdapter, PhotoLibraryPage } from "./adapterTypes";
import { PermissionState, PhotoAsset } from "../types";
import { extractLocationFromAssetInfo, NO_LOCATION, ExtractedLocation } from "./locationExtraction";

/** One hanging asset (iCloud, corrupt metadata) must never stall the whole scan. */
const PER_ASSET_TIMEOUT_MS = 8000;
/** Concurrent per-asset metadata reads. Low enough not to thrash the Photos daemon. */
const LOCATION_CONCURRENCY = 6;
/** iCloud-only assets can need a network fetch to expose their metadata. That is slow,
 * so it is retried only for a bounded number of assets per page — the rest are marked
 * "unavailable" (honest) instead of silently reported as having no location. */
const NETWORK_RETRY_BUDGET_PER_PAGE = 12;

function mapPermission(p: MediaLibrary.PermissionResponse): PermissionState {
  if (p.status === "granted") return p.accessPrivileges === "limited" ? ("granted_limited" as PermissionState) : ("granted_full" as PermissionState);
  if (p.status === "denied") return "denied" as PermissionState;
  return "unknown" as PermissionState;
}

function subtypeOf(asset: MediaLibrary.Asset): PhotoAsset["mediaSubtype"] {
  const mediaSubtypes = (asset as any).mediaSubtypes as string[] | undefined;
  if (mediaSubtypes?.includes("screenshot")) return "screenshot";
  if (mediaSubtypes?.includes("livePhoto")) return "livePhotoStill";
  if (mediaSubtypes?.includes("panorama")) return "panorama";
  return "photo";
}

/** Runs `worker` over `items` with at most `limit` calls in flight at once — used to
 * fetch per-asset location without firing hundreds of concurrent native calls on a
 * large library. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout_metadata")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

interface AssetLocationInfo {
  latitude: number | null;
  longitude: number | null;
  locationSource: PhotoAsset["locationSource"];
  metadataStatus: PhotoAsset["metadataStatus"];
  cloudAvailability: PhotoAsset["cloudAvailability"];
}

async function readAssetInfo(asset: MediaLibrary.Asset, downloadFromNetwork: boolean): Promise<any> {
  return withTimeout(
    // `shouldDownloadFromNetwork: false` on the first pass: the PHAsset's location and
    // EXIF are normally readable locally, and letting every asset pull its original
    // from iCloud would make a scan of a real library take minutes and time out —
    // which previously surfaced as "every photo has no location".
    MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: downloadFromNetwork } as any) as Promise<any>,
    PER_ASSET_TIMEOUT_MS,
  );
}

/** Fetches one asset's real coordinates. Never throws: a failure means "location
 * unknown for this photo", not a scan error (a photo genuinely without GPS — a
 * screenshot, location services off at capture time — is expected and normal). */
async function fetchAssetLocation(asset: MediaLibrary.Asset, networkRetryBudget: { remaining: number }): Promise<AssetLocationInfo> {
  let info: any = null;
  try {
    info = await readAssetInfo(asset, false);
  } catch {
    info = null;
  }

  let extracted: ExtractedLocation = info ? extractLocationFromAssetInfo(info) : NO_LOCATION;
  const isNetworkAsset = info?.isNetworkAsset === true;

  // Only assets that are still in iCloud (or whose local read failed outright) get a
  // second, network-enabled attempt, and only while the per-page budget lasts.
  if (extracted.source === "none" && (isNetworkAsset || info == null) && networkRetryBudget.remaining > 0) {
    networkRetryBudget.remaining -= 1;
    try {
      const retried = await readAssetInfo(asset, true);
      if (retried) {
        info = retried;
        extracted = extractLocationFromAssetInfo(retried);
      }
    } catch {
      // keep the first-pass outcome
    }
  }

  const cloudAvailability: PhotoAsset["cloudAvailability"] = info == null ? "unknown" : info.isNetworkAsset === true ? "cloud_pending" : "local";

  if (extracted.source !== "none") {
    return {
      latitude: extracted.latitude,
      longitude: extracted.longitude,
      locationSource: "original_metadata",
      metadataStatus: "ok",
      cloudAvailability,
    };
  }

  return {
    latitude: null,
    longitude: null,
    locationSource: "none",
    // info == null means we could not read the metadata at all (iCloud asset not
    // downloaded, OS refused): that is "unavailable", NOT a confirmed "no GPS".
    metadataStatus: info == null ? "unavailable" : "ok",
    cloudAvailability,
  };
}

export class NativePhotoLibraryAdapter implements PhotoLibraryAdapter {
  // The native module simply does not run in StackSail's react-native-web preview or
  // published website — this flag is checked before every call so we never report a
  // fake permission or a fake read there.
  readonly isAvailable = Platform.OS !== "web";

  async getPermission(): Promise<PermissionState> {
    if (!this.isAvailable) return "unavailable_in_preview" as PermissionState;
    try {
      const p = await MediaLibrary.getPermissionsAsync();
      return mapPermission(p);
    } catch (e) {
      return "unknown" as PermissionState;
    }
  }

  async requestPermission(): Promise<PermissionState> {
    if (!this.isAvailable) return "unavailable_in_preview" as PermissionState;
    try {
      const p = await MediaLibrary.requestPermissionsAsync();
      return mapPermission(p);
    } catch (e) {
      return "unknown" as PermissionState;
    }
  }

  async presentLimitedLibraryPicker(): Promise<boolean> {
    if (!this.isAvailable) return false;
    try {
      if (typeof (MediaLibrary as any).presentPermissionsPickerAsync === "function") {
        await (MediaLibrary as any).presentPermissionsPickerAsync();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getPage(cursor: string | null, pageSize: number, known?: ReadonlyMap<string, PhotoAsset>): Promise<PhotoLibraryPage> {
    if (!this.isAvailable) return { assets: [], hasNextPage: false, endCursor: null, totalCount: null };
    const result = await MediaLibrary.getAssetsAsync({
      first: pageSize,
      after: cursor ?? undefined,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });
    // The list call above never includes GPS — each asset's location has to be fetched
    // separately via getAssetInfoAsync (PHAsset location, with EXIF GPS as fallback).
    // An asset already read by the current pipeline and not modified since reuses its
    // cached result: a rescan then only pays for new/changed photos instead of
    // re-reading the entire library from scratch.
    const locations: (AssetLocationInfo | null)[] = result.assets.map((a) => {
      const k = known?.get(a.id);
      if (!k || k.metadataStatus !== "ok") return null;
      if ((k.modifiedAt ?? null) !== (a.modificationTime ?? null)) return null;
      return {
        latitude: k.latitude,
        longitude: k.longitude,
        locationSource: k.locationSource,
        metadataStatus: "ok",
        cloudAvailability: k.cloudAvailability,
      };
    });
    const toRead = locations.map((l, i) => (l == null ? i : -1)).filter((i) => i >= 0);
    const networkRetryBudget = { remaining: NETWORK_RETRY_BUDGET_PER_PAGE };
    const fresh = await mapWithConcurrency<number, AssetLocationInfo>(toRead, LOCATION_CONCURRENCY, (i) =>
      fetchAssetLocation(result.assets[i], networkRetryBudget),
    );
    toRead.forEach((assetIndex, j) => {
      locations[assetIndex] = fresh[j];
    });
    const unknownLocation: AssetLocationInfo = {
      latitude: null,
      longitude: null,
      locationSource: "none",
      metadataStatus: "unavailable",
      cloudAvailability: "unknown",
    };
    const resolved: AssetLocationInfo[] = locations.map((l) => l ?? unknownLocation);

    const assets: PhotoAsset[] = result.assets.map((a, i) => ({
      id: a.id,
      libraryAssetId: a.id,
      createdAt: a.creationTime ?? null,
      modifiedAt: a.modificationTime ?? null,
      width: a.width,
      height: a.height,
      latitude: resolved[i].latitude,
      longitude: resolved[i].longitude,
      locationSource: resolved[i].locationSource,
      mediaSubtype: subtypeOf(a),
      cloudAvailability: resolved[i].cloudAvailability,
      uri: a.uri,
      isDemo: false,
      metadataStatus: resolved[i].metadataStatus,
      scanGeneration: 0,
    }));
    return {
      assets,
      hasNextPage: result.hasNextPage,
      endCursor: result.endCursor ?? null,
      totalCount: result.totalCount ?? null,
    };
  }
}
