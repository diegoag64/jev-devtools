import type { HeroEffect } from "./types";
import { prism } from "./effects/prism";
import { brushed } from "./effects/brushed";
import { crystal } from "./effects/crystal";
import { opal } from "./effects/opal";
import { interference } from "./effects/interference";

export const effects: HeroEffect[] = [
  { id: "prism", name: "Prism foil · baseline", description: "Your original favorite, unchanged: shifting iridescent facets in blue, violet, rose, and champagne.", paint: prism },
  { id: "brushed", name: "Brushed foil", description: "A softer metallic finish with fine directional grain and a slow, narrow reflection.", paint: brushed },
  { id: "crystal", name: "Cut crystal", description: "Angular triangular facets catch a moving light, with tiny glints along their edges.", paint: crystal },
  { id: "opal", name: "Opal tides", description: "Curved mother-of-pearl contours roll through the letters in pastel, iridescent shells.", paint: opal },
  { id: "interference", name: "Interference silk", description: "Two crossing color waves form liquid thin-film bands, like light on a soap bubble.", paint: interference },
];
