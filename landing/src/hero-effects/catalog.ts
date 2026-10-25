import type { HeroEffect } from "./types";
import { createPrismJade, prismJade } from "./effects/prism-jade";

export const effects: HeroEffect[] = [
  { id: "left-to-right", name: "Left to right · current", description: "The approved organic sweep. Jade enters from the left; Prism returns from the right.", paint: prismJade },
  { id: "right-to-left", name: "Right to left", description: "The direction reverses: Jade enters from the right, then Prism returns from the left.", paint: createPrismJade("right-to-left") },
  { id: "sides-in", name: "Sides to center", description: "Jade grows inward from both ends and meets in the middle. Prism then expands out from the center.", paint: createPrismJade("sides-in") },
  { id: "center-out", name: "Center to sides", description: "Jade blooms at the center and spreads to both ends. Prism returns inward from the edges.", paint: createPrismJade("center-out") },
  { id: "spots", name: "Scattered spots", description: "Scattered pockets of Jade bloom at different times, merge, and take over every letter before receding.", paint: createPrismJade("spots") },
];
