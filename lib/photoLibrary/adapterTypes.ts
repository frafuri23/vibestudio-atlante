import { PermissionState, PhotoAsset } from "../types";

export interface PhotoLibraryPage {
  assets: PhotoAsset[];
  hasNextPage: boolean;
  endCursor: string | null;
  totalCount: number | null; // null = unknown; never fabricate a denominator
}

export interface PhotoLibraryAdapter {
  /** Whether this adapter can run in the current runtime at all — false in the
   * web/preview runtime for the native adapter (no fake permission states). */
  readonly isAvailable: boolean;
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  /** Opens the system's "manage selected photos" UI, when the platform supports it.
   * Returns false if unsupported so the caller can hide/disable the action. */
  presentLimitedLibraryPicker(): Promise<boolean>;
  /** `known` = metadata already read by the current location pipeline, keyed by id.
   * An adapter may reuse it for an asset whose modification date is unchanged
   * instead of re-reading that asset's metadata (the expensive per-asset call). */
  getPage(cursor: string | null, pageSize: number, known?: ReadonlyMap<string, PhotoAsset>): Promise<PhotoLibraryPage>;
}
