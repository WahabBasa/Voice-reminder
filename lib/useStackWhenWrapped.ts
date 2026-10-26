/**
 * Side-by-side buttons that bend instead of colliding (Apple-style): pass
 * `onTextLayout` to every label in the row; as soon as one label needs a
 * second line, `stacked` turns true and the row lays its buttons out
 * full-width, one above the other. It stays stacked for the life of the
 * component, so it can't flip back and forth. English fits on one line, so
 * the row is unchanged there.
 */
import { useCallback, useState } from "react";
import type { NativeSyntheticEvent, TextLayoutEventData } from "react-native";

export function labelWrapped(event: NativeSyntheticEvent<TextLayoutEventData>): boolean {
  return (event?.nativeEvent?.lines?.length ?? 0) > 1;
}

export function useStackWhenWrapped(): {
  stacked: boolean;
  onTextLayout: (event: NativeSyntheticEvent<TextLayoutEventData>) => void;
} {
  const [stacked, setStacked] = useState(false);
  const onTextLayout = useCallback((event: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (labelWrapped(event)) setStacked(true);
  }, []);
  return { stacked, onTextLayout };
}

/** Row → column, buttons full width, no flex-basis-0 collapse in the column. */
export const STACKED_ROW = { flexDirection: "column", alignItems: "stretch" } as const;
export const STACKED_BUTTON = { flex: 0, flexBasis: "auto", alignSelf: "stretch", alignItems: "center" } as const;
