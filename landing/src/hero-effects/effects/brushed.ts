import { random, wave, type PaintEffect } from "../types";

export const brushed: PaintEffect = (ctx, w, h, t) => {
  const base = ctx.createLinearGradient(0, 0, w, h * 0.6);
  const phase = t * 0.18;
  for (let i = 0; i <= 8; i++) {
    const hue = 235 + wave(phase + i * 0.95) * 105;
    base.addColorStop(i / 8, `hsl(${hue} 62% ${73 + wave(phase + i) * 10}%)`);
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Hairline grain gives the reflection the directionality of brushed metal.
  for (let i = 0; i < h * 1.4; i++) {
    const y = i / 1.4;
    ctx.strokeStyle = i % 3 ? "#fff5e72b" : "#49356418";
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(random(i) * w * 0.05, y);
    ctx.lineTo(w, y - h * 0.2);
    ctx.stroke();
  }
  const center = w * (0.5 + Math.sin(t * 0.32) * 0.62);
  const sheen = ctx.createLinearGradient(center - w * 0.18, 0, center + w * 0.18, h);
  sheen.addColorStop(0, "#fff0db00");
  sheen.addColorStop(0.46, "#fff0db12");
  sheen.addColorStop(0.5, "#fff0dbd9");
  sheen.addColorStop(0.56, "#fff0db24");
  sheen.addColorStop(1, "#fff0db00");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
};
