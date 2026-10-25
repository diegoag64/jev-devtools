import type { PaintEffect } from "../types";
import { jade, prism } from "./prism";

export const prismJade: PaintEffect = (ctx, w, h, t) => {
  prism(ctx, w, h, t);
  // Move beyond both edges so each palette gets a clean, complete turn.
  const margin = h * 0.22 + 2;
  const progress = (1 - Math.cos(t * Math.PI * 2 / 48)) / 2;
  const front = -margin + (w + margin * 2) * progress;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // A gently rippling ink front, instead of a whole-text opacity crossfade.
  // Only the antialiased seam mixes colors; both fields stay fully saturated.
  for (let step = 0; step <= 32; step++) {
    const v = step / 32;
    const ripple = h * (
      Math.sin(v * 3.4 + t * 0.45) * 0.13 +
      Math.sin(v * 8.2 - t * 0.6) * 0.04
    );
    ctx.lineTo(front + ripple, v * h);
  }
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.clip();
  // Same timestamp keeps the prism facets aligned on either side of the front.
  jade(ctx, w, h, t);
  ctx.restore();
};
