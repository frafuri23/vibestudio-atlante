import { PhotoLibraryAdapter } from "../photoLibrary/adapterTypes";
import { Repository } from "../db/repository";
import { IndexJobStatus, IndexPhase, PhotoAsset } from "../types";

/** `photos` is null when only the progress changed and the photo list was not
 * re-sent (throttled, see IndexingRunOptions.photoEmitIntervalMs). */
export type IndexingListener = (status: IndexJobStatus, photos: PhotoAsset[] | null) => void;

type ScanKind = "demo" | "real";

export interface IndexingRunOptions {
  /** Reuse metadata already in the cache for unchanged assets (false when the cache
   * was written by an older location pipeline and must be re-read). */
  reuseKnownMetadata?: boolean;
  /** Checked between pages. When it returns true the run stops cleanly with the
   * checkpoint still in phase "scanning" (so it stays resumable, unlike a user
   * pause). Used by the iOS background slice, which only gets ~30 s per wake. */
  shouldYield?: () => boolean;
  /** Minimum time between two photo-list emissions while scanning. Rebuilding and
   * re-rendering a 50k-photo array after every 100-photo page made a big scan
   * quadratic and froze the map; progress is still reported on every page. The
   * first, the final and any stop emission always carry the photos. 0 = every page. */
  photoEmitIntervalMs?: number;
}

/** Phases whose saved cursor is a valid place to continue from. "scanning" is what
 * is left on disk when iOS kills the app or an OTA update reloads the bundle. */
const RESUMABLE: IndexPhase[] = ["scanning", "paused", "cancelled", "error", "awaiting_permission"];

export function isResumableJob(job: IndexJobStatus | null | undefined, kind: ScanKind): boolean {
  return job != null && job.scanMode === kind && RESUMABLE.includes(job.phase) && job.cursor != null;
}

/** Progressive, resumable indexing state machine.
 *
 * Every page is committed together with its cursor (repo.commitScanPage). After a
 * kill, a relaunch or an OTA reload, the next run continues from that cursor, keeps
 * the rows already confirmed by this enumeration, and never re-reads them. A new
 * enumeration after a completed one starts at the first page (to see additions and
 * deletions) but reuses unchanged metadata, and keeps showing the previous results
 * until it finishes, so the map never empties out.
 */
export class IndexingCoordinator {
  private cancelled = false;
  private generation = 0;

  constructor(
    private adapter: PhotoLibraryAdapter,
    private repo: Repository,
  ) {}

  cancel(): void {
    this.cancelled = true;
  }

  async run(
    pageSize: number,
    onUpdate: IndexingListener,
    kind: ScanKind = "real",
    isCurrent: () => boolean = () => true,
    options: IndexingRunOptions = {},
  ): Promise<PhotoAsset[]> {
    this.cancelled = false;
    const previous = await this.repo.getIndexJob();
    const sameScope = previous != null && previous.scanMode === kind ? previous : null;
    const canResume = isResumableJob(sameScope, kind);
    this.generation = Math.max(this.generation + 1, (previous?.generation ?? 0) + 1);
    const myGeneration = this.generation;
    // The enumeration identity survives resumes; a fresh enumeration starts now.
    const startGeneration: number | null = canResume ? sameScope!.startGeneration ?? null : myGeneration;

    // When we stop before reading anything, the existing checkpoint must survive.
    const keptCursor = canResume ? sameScope!.cursor : null;
    const keptScanned = canResume ? sameScope!.scanned : 0;
    const keptTotal = canResume ? sameScope!.total : null;
    const keptStart = canResume ? sameScope!.startGeneration ?? null : null;

    if (!isCurrent()) return [];

    if (!this.adapter.isAvailable) {
      const status: IndexJobStatus = {
        phase: "unavailable_in_preview", scanned: keptScanned, total: keptTotal, cursor: keptCursor, scanMode: kind,
        generation: myGeneration, startGeneration: keptStart, lastError: null, observedPermission: "unavailable_in_preview",
      };
      await this.repo.setIndexJob(status);
      if (isCurrent()) onUpdate(status, []);
      return [];
    }

    const permission = await this.adapter.getPermission();
    if (!isCurrent()) return [];
    if (permission === "denied" || permission === "unknown") {
      const status: IndexJobStatus = {
        phase: "awaiting_permission", scanned: keptScanned, total: keptTotal, cursor: keptCursor, scanMode: kind,
        generation: myGeneration, startGeneration: keptStart, lastError: null, observedPermission: permission,
      };
      await this.repo.setIndexJob(status);
      if (isCurrent()) onUpdate(status, []);
      return [];
    }

    const cachedAll = await this.repo.getCachedPhotoAssets();
    if (!isCurrent()) return [];
    const cachedScope = cachedAll.filter((p) => (kind === "demo") === p.isDemo);

    // What the UI keeps showing while this enumeration runs (last known results).
    const baseline = new Map<string, PhotoAsset>();
    for (const p of cachedScope) baseline.set(p.id, p);

    // Rows already confirmed by THIS enumeration (only when resuming).
    const collectedById = new Map<string, PhotoAsset>();
    if (canResume) {
      for (const p of cachedScope) {
        // Legacy checkpoints have no startGeneration: keep every cached row of the scope.
        if (startGeneration == null || (p.scanGeneration ?? 0) >= startGeneration) collectedById.set(p.id, p);
      }
    }

    const known: ReadonlyMap<string, PhotoAsset> | undefined = options.reuseKnownMetadata !== false ? baseline : undefined;
    const collected = (): PhotoAsset[] => Array.from(collectedById.values());
    const visible = (): PhotoAsset[] => {
      const merged = new Map(baseline);
      for (const [id, p] of collectedById) merged.set(id, p);
      return Array.from(merged.values());
    };

    let cursor: string | null = keptCursor;
    let scanned = canResume ? Math.max(keptScanned, collectedById.size) : 0;
    let total: number | null = keptTotal;

    const statusOf = (phase: IndexPhase, lastError: string | null = null): IndexJobStatus => ({
      phase, scanned, total, cursor, scanMode: kind, generation: myGeneration, startGeneration,
      lastError, observedPermission: permission,
    });

    const emitInterval = options.photoEmitIntervalMs ?? 0;
    let lastPhotoEmit = 0;
    const emitProgress = (status: IndexJobStatus) => {
      const now = Date.now();
      if (now - lastPhotoEmit >= emitInterval) {
        lastPhotoEmit = now;
        onUpdate(status, visible());
      } else {
        onUpdate(status, null);
      }
    };

    try {
      lastPhotoEmit = Date.now();
      onUpdate(statusOf("scanning"), visible());
      while (true) {
        if (!isCurrent()) return collected();
        if (this.cancelled || myGeneration !== this.generation) {
          // Every page is already persisted with its cursor; only the phase changes.
          const status = statusOf("cancelled");
          await this.repo.setIndexJob(status);
          if (isCurrent()) onUpdate(status, visible());
          return visible();
        }

        if (options.shouldYield?.()) {
          const status = statusOf("scanning");
          await this.repo.setIndexJob(status);
          if (isCurrent()) onUpdate(status, visible());
          return visible();
        }

        const page = await this.adapter.getPage(cursor, pageSize, known);
        if (!isCurrent()) return collected();
        const stamped = page.assets.map((asset) => ({ ...asset, scanGeneration: myGeneration }));
        for (const asset of stamped) collectedById.set(asset.id, asset);
        scanned = collectedById.size;
        total = page.totalCount;
        // Keep the last real cursor on the final page so a kill before completion
        // never degrades into "start over".
        if (page.endCursor != null) cursor = page.endCursor;
        const status = statusOf("scanning");
        // Checkpoint: this page's rows + cursor, atomically.
        await this.repo.commitScanPage(stamped, status);
        if (!isCurrent()) return collected();
        emitProgress(status);
        if (!page.hasNextPage) break;
      }

      if (!isCurrent()) return collected();
      // A completed enumeration is authoritative for this scope: remove assets that
      // disappeared from the library. Every row of this enumeration was already
      // committed page by page with scanGeneration >= startGeneration, so only the
      // older rows need deleting — no rewrite of the whole library. Legacy
      // checkpoints (no startGeneration) fall back to the full replacement.
      if (startGeneration != null) await this.repo.pruneStalePhotoAssets(kind === "demo", startGeneration);
      else await this.repo.replacePhotoAssets(collected(), kind === "demo");
      if (!isCurrent()) return collected();
      cursor = null;
      const finalStatus: IndexJobStatus = { ...statusOf("completed"), startGeneration: null };
      await this.repo.setIndexJob(finalStatus);
      onUpdate(finalStatus, collected());
      return collected();
    } catch (e: any) {
      if (!isCurrent()) return collected();
      const errStatus = statusOf("error", e?.message ?? "Errore sconosciuto durante la scansione.");
      await this.repo.setIndexJob(errStatus).catch(() => {});
      if (isCurrent()) onUpdate(errStatus, visible());
      return visible();
    }
  }
}
