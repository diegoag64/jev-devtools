# Temporary hero effect lab

Loaded by the **single DEV-only import block at the end of `src/main.ts`**. Vite removes that block and its modules from a production build. No dependencies, network requests, or assets are needed. The original CSS pearl treatment remains the production fallback while experimenting.

The collection compares the **Original prism** baseline with four palettes: **Rose quartz**, **Glacier blue**, **Peach champagne**, and **Jade & gold**. All five call the same `createPrism` painter with different color parameters. Geometry, gradient-stop positions, saturation/lightness, and animation timing are identical. Earlier shape experiments have been removed; Git retains them if needed.

Use the bottom-right picker to choose one of five effects, move backward/forward (wrapping at the ends), pause, change speed, or cycle every 10 seconds. The selection persists in session storage. Auto cycling waits while the effect select has focus and suspends when the hero is offscreen or the document is hidden. Reduced motion renders a still frame and disables motion controls. Forced colors uses the native text. Hide collapses the panel without changing the selected effect.

The shared painter lives in `effects/prism.ts` and implements `(context, width, height, seconds) => void`. Palette values live only in `catalog.ts`. `renderer.ts` owns the accessible native text overlay, canvas mask, sizing, and animation lifecycle. `lab.ts` and `lab.css` contain only the disposable controls. `catalog.ts` is the disposable list of alternatives.

## Keep a winner

1. Delete the DEV-only import block in `main.ts`.
2. Keep only `renderer.ts`, `renderer.css`, `types.ts`, and `effects/prism.ts`.
3. Copy the chosen `createPrism({ base, hueStart, hueRange, highlight })` configuration from `catalog.ts` into your final initializer (or use `prism` for the original). Import `mountHeroEffect` and that painter in `main.ts`, then call `mountHeroEffect(document.querySelector<HTMLElement>(".hero h1 > span")!, painter)` after the page markup exists. Register its `destroy` method with Vite HMR if retaining hot reload.
4. Delete `lab.ts`, `lab.css`, `catalog.ts`, and this README. Remove the superseded CSS pearl animation from `style.css`, retaining solid pink as the no-JavaScript/no-canvas fallback. Update the landing README and changelog.
5. Check the build, native text accessibility, reduced motion, resize behavior, and chosen effect in desktop/mobile browsers.

## Remove the entire experiment

Delete the single DEV import block and this entire `hero-effects/` directory. The previous CSS pearl effect is restored automatically. The optional session-storage key `jevtools:hero-effect-lab:prism-palettes` can also be removed; it has no effect without the lab.
