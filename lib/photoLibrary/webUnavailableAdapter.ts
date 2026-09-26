// Web/preview stand-in for the real photo-library adapter.
//
// Why this exists: on web there is no photo library API at all (expo-media-library is
// a native module). Previously "real" mode on web still lazily loaded the native
// adapter module, which evaluates the expo-media-library import at module scope inside
// the browser preview — an unnecessary risk during app boot, and the boot is exactly
// where a failure is invisible (it just never finishes, so the preview looks stuck).
//
// This adapter imports nothing native and is explicit about being unavailable: it
// NEVER returns fabricated photos or a fake "granted" permission.
import { PhotoLibraryAdapter, PhotoLibraryPage } from "./adapterTypes";
import { PermissionState } from "../types";

export class WebUnavailablePhotoLibraryAdapter implements PhotoLibraryAdapter {
  readonly isAvailable = false;

  async getPermission(): Promise<PermissionState> {
    return "unavailable_in_preview" as PermissionState;
  }

  async requestPermission(): Promise<PermissionState> {
    return "unavailable_in_preview" as PermissionState;
  }

  async presentLimitedLibraryPicker(): Promise<boolean> {
    return false;
  }

  async getPage(): Promise<PhotoLibraryPage> {
    return { assets: [], hasNextPage: false, endCursor: null, totalCount: null };
  }
}
