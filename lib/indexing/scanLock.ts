/** Process-wide mutual exclusion for library scans.
 *
 * The foreground scan (lib/appState.tsx) and the iOS background-fetch slice
 * (lib/indexing/backgroundScan.ts) share one JS runtime and one repository. When iOS
 * wakes a suspended app, both could otherwise run at once and interleave checkpoints.
 * Every scan goes through runExclusive: a caller waits for the current one to finish
 * and then claims the lock synchronously (no await between the idle check and the
 * claim), so two callers can never both start. */
let current: Promise<unknown> | null = null;

export function isScanRunning(): boolean {
  return current != null;
}

export async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  while (current) {
    await current.catch(() => {});
  }
  const task = fn();
  current = task;
  try {
    return await task;
  } finally {
    if (current === task) current = null;
  }
}

/** Resolves when no scan is running, or after maxMs, whichever comes first. */
export async function waitForScanIdle(maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (current && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    await Promise.race([
      current.catch(() => {}),
      new Promise((r) => setTimeout(r, Math.max(0, remaining))),
    ]);
  }
}
