import { wave, type PaintEffect } from "../types";

// A bounded, low-resolution color field is smoothed by the main text canvas.
// No extra animation loop or DOM node; the shared renderer owns the lifecycle.
let surface: HTMLCanvasElement | undefined;
let context: CanvasRenderingContext2D | null = null;
let pixels: ImageData;
export const interference: PaintEffect = (ctx, w, h, t) => {
  if (!surface) {
    surface = document.createElement("canvas");
    surface.width = 240;
    surface.height = 48;
    context = surface.getContext("2d");
    if (context) pixels = context.createImageData(surface.width, surface.height);
  }
  if (!context) {
    ctx.fillStyle = "#e6b4e7";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 240; x++) {
      const u = x / 240, v = y / 48;
      const a = u * 22 + v * 4 + Math.sin(v * 3 + t * 0.28) * 2;
      const b = u * 11 - v * 5 - t * 0.4 + Math.sin(u * 6 + t * 0.22);
      const highlight = wave(a + b) ** 10 * 28;
      const index = (y * 240 + x) * 4;
      pixels.data[index] = 187 + Math.sin(a + t * 0.22) * 45 + highlight;
      pixels.data[index + 1] = 176 + Math.sin(b + 0.9) * 43 + highlight;
      pixels.data[index + 2] = 215 + Math.sin(a * 0.5 - b + 2) * 30 + highlight;
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  ctx.drawImage(surface, 0, 0, w, h);
};
