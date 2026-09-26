import { Repository } from "../db/repository";
import { PhotoAsset } from "../types";
import { buildSuggestedMemories } from "./engine";

/** Recomputes suggested memories + visits deterministically from a settled scan and
 * persists them. Shared by the foreground scan and the iOS background slice, so a
 * scan that completes while the app is in background produces the same chapters.
 *
 * Written as ONE batch (repo.replaceSuggestions): on a large library the previous
 * one-write-per-chapter/visit loop meant thousands of separate commits. */
export async function refreshSuggestedMemories(
  repo: Repository,
  photos: PhotoAsset[],
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const overridesList = await repo.listOverrides();
  if (!isCurrent()) return false;
  const overridesMap = Object.fromEntries(overridesList.map((o) => [o.photoId, o]));
  const existing = await repo.listMemories();
  if (!isCurrent()) return false;
  const { chapters, visits } = buildSuggestedMemories(photos, overridesMap, existing);
  if (!isCurrent()) return false;
  await repo.replaceSuggestions(chapters, visits);
  return isCurrent();
}
