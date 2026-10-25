import type { PaintEffect } from "../types";
import { jade, prism } from "./prism";

const MASK_WIDTH = 256;
const MASK_HEIGHT = 48;
let mask: HTMLCanvasElement | undefined;
let maskContext: CanvasRenderingContext2D | null = null;
let maskPixels: ImageData;
let layer: HTMLCanvasElement | undefined;
let layerContext: CanvasRenderingContext2D | null = null;

function hash(x: number, y: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
function smooth(value: number) {
  return value * value * (3 - 2 * value);
}
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const sx = smooth(x - ix), sy = smooth(y - iy);
  const top = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
  const bottom = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

export const prismJade: PaintEffect = (ctx, w, h, t) => {
  prism(ctx, w, h, t);
  // Two bounded working surfaces; the shared renderer owns all scheduling.
  if (!mask) {
    mask = document.createElement("canvas");
    mask.width = MASK_WIDTH;
    mask.height = MASK_HEIGHT;
    maskContext = mask.getContext("2d");
    if (maskContext) maskPixels = maskContext.createImageData(MASK_WIDTH, MASK_HEIGHT);
    layer = document.createElement("canvas");
    layerContext = layer.getContext("2d");
  }
  if (!maskContext || !layerContext || !layer) return;

  const progress = (1 - Math.cos(t * Math.PI * 2 / 64)) / 2;
  for (let y = 0; y < MASK_HEIGHT; y++) {
    const v = y / (MASK_HEIGHT - 1);
    for (let x = 0; x < MASK_WIDTH; x++) {
      const u = x / (MASK_WIDTH - 1);
      // The leftward bias keeps a direction, while two smooth scales make local
      // pockets arrive at different times. Slow drift prevents a mechanical wipe.
      const broad = noise(u * 4.8 + t * 0.012, v * 1.6 + t * 0.018);
      const detail = noise(u * 11 - t * 0.008 + 7, v * 3.6 + 11);
      const arrival = 0.02 + u * 0.66 + broad * 0.24 + detail * 0.08;
      // Feather only a small neighborhood of each boundary. The rest of each
      // palette stays opaque, avoiding the gray whole-text crossfade midpoint.
      const reveal = Math.max(0, Math.min(1, (progress - arrival + 0.012) / 0.024));
      const index = (y * MASK_WIDTH + x) * 4;
      maskPixels.data[index] = 255;
      maskPixels.data[index + 1] = 255;
      maskPixels.data[index + 2] = 255;
      maskPixels.data[index + 3] = Math.round(smooth(reveal) * 255);
    }
  }
  maskContext.putImageData(maskPixels, 0, 0);

  const width = Math.round(w * 2), height = Math.round(h * 2);
  if (layer.width !== width || layer.height !== height) {
    layer.width = width;
    layer.height = height;
  }
  layerContext.setTransform(2, 0, 0, 2, 0, 0);
  layerContext.clearRect(0, 0, w, h);
  jade(layerContext, w, h, t);
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.drawImage(mask, 0, 0, w, h);
  layerContext.globalCompositeOperation = "source-over";
  ctx.drawImage(layer, 0, 0, width, height, 0, 0, w, h);
};
