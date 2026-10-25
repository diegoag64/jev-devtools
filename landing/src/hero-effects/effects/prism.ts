import { wave, type PaintEffect } from "../types";
export const prism: PaintEffect = (ctx, w, h, t) => {
  ctx.fillStyle = "#d2b4ee";
  ctx.fillRect(0, 0, w, h);
  // Moving triangular facets refract neighboring hues at different angles.
  for (let i = -1; i < 16; i++) {
    const size = w / 10;
    const x = i * size + Math.sin(t * 0.22) * size;
    const tip = x + size * (0.7 + Math.sin(t * 0.4 + i) * 0.25);
    const gradient = ctx.createLinearGradient(x, 0, x + size * 1.5, h);
    const hue = 200 + wave(t * 0.3 + i * 0.7) * 155;
    gradient.addColorStop(0, `hsl(${hue} 80% 82%)`);
    gradient.addColorStop(0.48, `hsl(${hue + 20} 65% 71%)`);
    gradient.addColorStop(0.54, "#fff1e7");
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
