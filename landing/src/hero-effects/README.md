# Temporary hero transition lab

The **single DEV-only import block at the end of `src/main.ts`** loads this lab. Vite removes it and its modules from production builds. No dependencies or network requests are added. The existing CSS pearl treatment remains the production fallback until the final animated treatment is promoted.

## Current direction

The chosen visual treatment is **Original Prism foil + Jade & gold**, with the same aligned facets and the approved organic mask, narrow edge feathering, and 64-second round trip. The picker now compares only transition patterns:

- **Left to right:** the approved organic sweep; returns from the right.
- **Right to left:** enters from the right; returns from the left.
- **Sides to center:** enters from both ends; returns outward from the center.
- **Center to sides:** enters from the center; returns inward from both ends.
- **Scattered spots:** deterministic, staggered blooms spread across the words and merge until every location is taken over.

The masks share bounded working canvases. The scattered arrival map is computed once; the organic directional maps drift slowly. Both palettes stay opaque except at the narrow feathered boundaries, avoiding a gray whole-text crossfade.

## Comparing transitions

Previous/Next and the select preserve the animation time and paused state, so all patterns can be compared at the exact same point. **Half takeover** pauses at 16 seconds (the outward transition's midpoint). **Cycle position** scrubs the full loop and pauses; **Play** continues from there. Speed ranges from 0.25× to 4×. Optional automatic cycling changes types every 10 seconds without restarting the loop. It waits while the select has focus and suspends when the hero or document is hidden. Selection persists under `jevtools:hero-effect-lab:transitions` in session storage.

Reduced motion freezes the animation and disables motion controls; manual scrubbing still permits inspecting a still frame. Forced colors uses native text. Hide collapses the panel without changing the selected transition.

## Keeping the final choice

1. Remove the DEV import block from `main.ts`.
2. Keep `renderer.ts`, `renderer.css`, `types.ts`, `effects/prism.ts`, and `effects/prism-jade.ts`.
3. Import `mountHeroEffect` and `createPrismJade` in the page initializer. After markup exists, call `mountHeroEffect(document.querySelector<HTMLElement>(".hero h1 > span")!, createPrismJade("left-to-right"))`, substituting the chosen transition id. Register the returned `destroy` method with Vite HMR if retaining hot reload.
4. Delete `lab.ts`, `lab.css`, `catalog.ts`, and this README. Remove unchosen mask branches and helpers, the optional renderer time callback and scrubbing methods, and superseded CSS pearl animation rules. Retain the solid-pink fallback. Update the landing README and changelog.
5. Check the build, native text accessibility, reduced motion, resize behavior, and chosen animation at desktop/mobile sizes.

## Removing the whole experiment

Delete the single DEV import block and this entire directory. The existing CSS pearl treatment returns automatically. The session-storage key can be removed too, but has no effect without the lab. Earlier palettes and effect experiments remain recoverable from Git.
