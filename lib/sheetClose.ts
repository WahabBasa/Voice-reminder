/**
 * Close detection for @gorhom/bottom-sheet overlays that must release parent
 * state (the dock renders only while no overlay is open).
 *
 * The library's callbacks cannot be the only close signal: a pan that ends
 * with the sheet already resting at the closed position early-returns out of
 * animateToPosition (position === animatedPosition, BottomSheet.tsx:611 in
 * v5.2.7), emitting neither onAnimate nor onChange. The sheet is visually
 * gone but the parent never hears about it — its "overlay open" state stays
 * set and the dock stays unmounted until the app restarts.
 *
 * So overlays watch the sheet's animatedIndex stream instead: -1 is closed,
 * 0+ are snap points, and the value moves continuously between them during
 * both animations and gestures. Fire exactly on the downward crossing into
 * closed — mounting at -1 and opening upward never cross that way.
 */

const CLOSED_THRESHOLD = -1 + 1e-3;

/**
 * True exactly when the animated index crosses downward into the closed
 * position. Called every frame from a Reanimated reaction; prev is null on
 * the reaction's first run.
 */
export function crossedIntoClosed(
    prev: number | null | undefined,
    curr: number
): boolean {
    "worklet";
    if (prev === null || prev === undefined) return false;
    return curr <= CLOSED_THRESHOLD && prev > CLOSED_THRESHOLD;
}
