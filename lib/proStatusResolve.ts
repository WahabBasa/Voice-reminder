import type { ProStatus } from "./proCardContent";

/**
 * The entitlement, resolved for a decision that cannot be taken back (OLD-127).
 *
 * The two tap gates in app/index.tsx ask a different question: they need an
 * answer NOW, in front of an open overlay, and they heal the cache behind
 * whatever lock they put up. The take import asks this one, because it is about
 * to delete rows on the server if the answer is "free" — so it is allowed to
 * wait for a round trip, and a check that still will not resolve must stay
 * `unknown` rather than collapse to "not a subscriber".
 *
 * Three outcomes, and the third is the point:
 *   - a cached `pro` or `free` is taken as-is (the overwhelming majority);
 *   - an unresolved entitlement spends exactly one forced refresh;
 *   - a refresh that fails or comes back unresolved stays `unknown`, which the
 *     import turns into a `cap_unverified` card — no import, no server deletes,
 *     no upsell.
 *
 * Reaches the purchases SDK through a dynamic import for the same reason
 * usageGate does: this module has to stay importable without the native module.
 */
export async function resolveImportProStatus(): Promise<ProStatus> {
  const { getProStatusSnapshot, forceRefreshProStatus } = await import("./purchases");

  const snapshot = getProStatusSnapshot();
  if (snapshot !== "unknown") return snapshot;

  return await forceRefreshProStatus().catch(() => "unknown" as ProStatus);
}
