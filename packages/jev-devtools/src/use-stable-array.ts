import { useState } from "react";

/**
 * Keeps the previous array while its items are the same objects, so memoized
 * children skip unrelated updates. Adjusts state during render (React's
 * pattern for deriving from changing props) instead of writing a ref.
 */
export function useStableArray<T>(next: readonly T[]): readonly T[] {
  const [stable, setStable] = useState(next);
  const same =
    stable.length === next.length && stable.every((v, i) => v === next[i]);
  if (!same) setStable(next);
  return same ? stable : next;
}
