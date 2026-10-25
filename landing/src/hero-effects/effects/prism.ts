import { wave, type PaintEffect } from "../types";
export type PrismPalette = {
  base: string;
  hueStart: number;
  hueRange: number;
  highlight: string;
};

const original: PrismPalette = {
  base: "#d2b4ee",
  hueStart: 200,
  hueRange: 155,
  highlight: "#fff1e7",
};

// Every palette shares the exact same geometry, timing, and gradient stops.
export function createPrism(palette: PrismPalette = original): PaintEffect {
  return (ctx, w, h, t) => {
    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, w, h);
    // Moving triangular facets refract neighboring hues at different angles.
    for (let i = -1; i < 16; i++) {
      const size = w / 10;
      const x = i * size + Math.sin(t * 0.22) * size;
      const tip = x + size * (0.7 + Math.sin(t * 0.4 + i) * 0.25);
      const gradient = ctx.createLinearGradient(x, 0, x + size * 1.5, h);
      const hue = palette.hueStart + wave(t * 0.3 + i * 0.7) * palette.hueRange;
      gradient.addColorStop(0, `hsl(${hue} 80% 82%)`);
      gradient.addColorStop(0.48, `hsl(${hue + 20} 65% 71%)`);
      gradient.addColorStop(0.54, palette.highlight);
      gradient.addColorStop(1, `hsl(${hue - 25} 75% 80%)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + size * 1.9, 0);
      ctx.lineTo(tip, h);
      ctx.lineTo(x - size * 0.5, h);
      ctx.closePath();
      ctx.fill();
    }
  };
}

export const prism = createPrism();

export const jade = createPrism({
  base: "#cddcb2",
  hueStart: 40,
  hueRange: 125,
  highlight: "#fbffe8",
});
