import type { PaintEffect } from "../types";
import { jade, prism } from "./prism";

// One bounded offscreen layer, with no animation loop or DOM attachment of its own.
let layer: HTMLCanvasElement | undefined;
let layerContext: CanvasRenderingContext2D | null = null;

export const prismJade: PaintEffect = (ctx, w, h, t) => {
  prism(ctx, w, h, t);
  if (!layer) {
    layer = document.createElement("canvas");
    layerContext = layer.getContext("2d");
  }
  if (!layerContext) return;
  const width = Math.round(w * 2), height = Math.round(h * 2);
  if (layer.width !== width || layer.height !== height) {
    layer.width = width;
    layer.height = height;
  }
  layerContext.setTransform(2, 0, 0, 2, 0, 0);
  layerContext.clearRect(0, 0, w, h);
  // Both palettes use the same timestamp, so the facets stay perfectly aligned.
  jade(layerContext, w, h, t);
  // 24 seconds in each direction, easing to zero speed at both palette endpoints.
  // Blend finished color fields once; fading individual overlapping facets would
  // change their geometry and transparency instead of only their colors.
  const mix = (1 - Math.cos(t * Math.PI * 2 / 48)) / 2;
  ctx.save();
  ctx.globalAlpha = mix;
  ctx.drawImage(layer, 0, 0, width, height, 0, 0, w, h);
  ctx.restore();
};
