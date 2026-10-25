import type { HeroEffect } from "./types";
import { createPrism, prism } from "./effects/prism";

export const effects: HeroEffect[] = [
  { id: "prism", name: "Original prism · baseline", description: "The original blue, violet, rose, and champagne palette. Every option uses this exact effect and motion.", paint: prism },
  { id: "rose", name: "Rose quartz", description: "Pink, orchid, and soft rose with a pearly blush reflection. Close to the site's existing accent.", paint: createPrism({ base: "#edb9db", hueStart: 290, hueRange: 60, highlight: "#fff0f6" }) },
  { id: "ice", name: "Glacier blue", description: "Aquamarine, icy blue, and periwinkle with a cool white reflection.", paint: createPrism({ base: "#b7d9ed", hueStart: 175, hueRange: 65, highlight: "#edfaff" }) },
  { id: "copper", name: "Peach champagne", description: "Coral, peach, and pale gold with a warm champagne reflection.", paint: createPrism({ base: "#eec2b0", hueStart: 335, hueRange: 70, highlight: "#fff1dc" }) },
  { id: "jade", name: "Jade & gold", description: "Pale gold, mint, and jade with a soft ivory reflection.", paint: createPrism({ base: "#cddcb2", hueStart: 40, hueRange: 125, highlight: "#fbffe8" }) },
];
