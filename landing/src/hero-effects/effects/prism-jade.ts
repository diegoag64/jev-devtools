import type { PaintEffect } from "../types";
import { jade, prism } from "./prism";
import { createTransitionCycle } from "../transition-cycle";

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

let spotArrivals: Float32Array | undefined;
function getSpotArrivals() {
  if (spotArrivals) return spotArrivals;
  const spots = Array.from({ length: 22 }, (_, i) => ({
    x: (i + hash(i, 21) * 0.8) / 22,
    y: hash(i, 37),
    delay: 0.05 + hash(i, 53) * 0.35,
    radius: 0.6 + hash(i, 71) * 0.6,
  }));
  const field = new Float32Array(MASK_WIDTH * MASK_HEIGHT);
  let minimum = Infinity, maximum = -Infinity;
  for (let y = 0; y < MASK_HEIGHT; y++) {
    for (let x = 0; x < MASK_WIDTH; x++) {
      const u = x / (MASK_WIDTH - 1), v = y / (MASK_HEIGHT - 1);
      let arrival = Infinity;
      for (const spot of spots) {
        // The title is about six times wider than its line box; keep blooms round.
        const distance = Math.hypot((u - spot.x) * 6, v - spot.y);
        arrival = Math.min(arrival, spot.delay + distance / spot.radius);
      }
      field[y * MASK_WIDTH + x] = arrival;
      minimum = Math.min(minimum, arrival);
      maximum = Math.max(maximum, arrival);
    }
  }
  // Every location is reached before the cycle endpoint; no unfinished holes.
  for (let i = 0; i < field.length; i++) {
    field[i] = 0.04 + (field[i] - minimum) / (maximum - minimum) * 0.92;
  }
  spotArrivals = field;
  return field;
}

export function createHeroPainter(): PaintEffect {
  const cycle = createTransitionCycle();
  const palettes = { prism, jade };
  return (ctx, w, h, t) => {
    const { kind, from, to, progress } = cycle(t);
    palettes[from](ctx, w, h, t);
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

    const spots = kind === "spots" ? getSpotArrivals() : undefined;
    for (let y = 0; y < MASK_HEIGHT; y++) {
      const v = y / (MASK_HEIGHT - 1);
      for (let x = 0; x < MASK_WIDTH; x++) {
        const u = x / (MASK_WIDTH - 1);
        let arrival: number;
        if (spots) {
          arrival = spots[y * MASK_WIDTH + x];
        } else {
          // Preserve the approved organic mask; vary only its overall direction.
          const direction = kind === "right-to-left" ? 1 - u
            : kind === "sides-in" ? 1 - Math.abs(u * 2 - 1)
            : kind === "center-out" ? Math.abs(u * 2 - 1)
            : u;
          const broad = noise(u * 4.8 + t * 0.012, v * 1.6 + t * 0.018);
          const detail = noise(u * 11 - t * 0.008 + 7, v * 3.6 + 11);
          // Finish every feathered edge before changing masks at the endpoint.
          arrival = Math.max(0.04, Math.min(0.96, 0.02 + direction * 0.66 + broad * 0.24 + detail * 0.08));
        }
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
    palettes[to](layerContext, w, h, t);
    layerContext.globalCompositeOperation = "destination-in";
    layerContext.drawImage(mask, 0, 0, w, h);
    layerContext.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, 0, 0, width, height, 0, 0, w, h);
  };
}
