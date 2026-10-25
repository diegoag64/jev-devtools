import type { HeroEffect } from "./types";
import { pearl } from "./effects/pearl";
import { paint } from "./effects/paint";
import { ribbons } from "./effects/ribbons";
import { prism } from "./effects/prism";
import { stars } from "./effects/stars";
export const effects: HeroEffect[] = [
  { id: "pearl", name: "Pearl drift", description: "Soft pools of rose, lilac, mint, and warm pearl. Slow, subtle, and luminous.", paint: pearl },
  { id: "paint", name: "Paint splashes", description: "Irregular pigment splashes and tiny droplets bloom across the letters.", paint },
  { id: "ribbons", name: "Liquid ribbons", description: "Silky ribbons of color bend and weave, edged with fine highlights.", paint: ribbons },
  { id: "prism", name: "Prism foil", description: "Sharp, iridescent facets shift between icy blue, violet, rose, and champagne.", paint: prism },
  { id: "stars", name: "Starfield", description: "A pink and violet nebula filled with slowly drifting, softly twinkling stars.", paint: stars },
];
