const TAKEOVER_SECONDS = 32;
const kinds = ["left-to-right", "right-to-left", "sides-in", "center-out", "spots"] as const;
export type TransitionKind = typeof kinds[number];
type Palette = "prism" | "jade";

// A new mask is chosen only when a complete palette takeover has finished.
// The incoming palette then becomes the next pass's background, hiding the
// mask change at a fully opaque endpoint while facet motion remains continuous.
export function createTransitionCycle() {
  let pass = -1;
  let selected = -1;
  return (seconds: number) => {
    const nextPass = Math.floor(seconds / TAKEOVER_SECONDS);
    if (nextPass !== pass) {
      const choices = selected < 0 ? kinds.length : kinds.length - 1;
      let next = Math.floor(Math.random() * choices);
      if (selected >= 0 && next >= selected) next++;
      selected = next;
      pass = nextPass;
    }
    const elapsed = seconds % TAKEOVER_SECONDS;
    const from: Palette = pass % 2 === 0 ? "prism" : "jade";
    const to: Palette = from === "prism" ? "jade" : "prism";
    return {
      kind: kinds[selected],
      from,
      to,
      progress: (1 - Math.cos(elapsed / TAKEOVER_SECONDS * Math.PI)) / 2,
    };
  };
}
