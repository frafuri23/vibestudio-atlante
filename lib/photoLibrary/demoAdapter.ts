import { PhotoLibraryAdapter, PhotoLibraryPage } from "./adapterTypes";
import { PermissionState } from "../types";
import { demoPhotos } from "../fixtures/demoPhotos";

/** Fixture-backed adapter for demo mode. Always clearly synthetic data — never
 * presented as if it came from the user's real gallery. */
export class DemoPhotoLibraryAdapter implements PhotoLibraryAdapter {
  readonly isAvailable = true;

  async getPermission(): Promise<PermissionState> {
    return "granted_full" as PermissionState;
  }
  async requestPermission(): Promise<PermissionState> {
    return "granted_full" as PermissionState;
  }
  async presentLimitedLibraryPicker(): Promise<boolean> {
    return false;
  }
  async getPage(cursor: string | null, pageSize: number): Promise<PhotoLibraryPage> {
    const start = cursor ? parseInt(cursor, 10) : 0;
    const slice = demoPhotos.slice(start, start + pageSize);
    const end = start + slice.length;
    return {
      assets: slice,
      hasNextPage: end < demoPhotos.length,
      endCursor: end < demoPhotos.length ? String(end) : null,
      totalCount: demoPhotos.length,
    };
  }
}
