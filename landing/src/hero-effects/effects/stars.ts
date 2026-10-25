import { pool, random, wave, type PaintEffect } from "../types";
export const stars: PaintEffect = (ctx, w, h, t) => {
  ctx.fillStyle = "#b68bcf";
  ctx.fillRect(0, 0, w, h);
  pool(ctx, w * (0.35 + Math.sin(t * 0.15) * 0.2), h * 0.3, w * 0.35, "#eea8d5");
  pool(ctx, w * (0.7 + Math.cos(t * 0.2) * 0.15), h, w * 0.28, "#a7b7ee");
  for (let i = 0; i < 155; i++) {
    const x = (random(i + 1) * w + t * (1 + random(i + 8) * 2)) % w;
    const y = random(i + 200) * h;
    const shimmer = wave(t * (0.5 + random(i)) + i * 3);
    const radius = h * (0.003 + random(i + 80) * 0.009);
    ctx.globalAlpha = 0.25 + shimmer * 0.7;
    ctx.fillStyle = "#fff5e8";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (i % 13 === 0) {
      const reach = radius * (2 + shimmer * 3);
      ctx.beginPath();
      ctx.moveTo(x - reach, y); ctx.lineTo(x, y - radius);
      ctx.lineTo(x, y - reach); ctx.lineTo(x + radius, y);
      ctx.lineTo(x + reach, y); ctx.lineTo(x, y + radius);
      ctx.lineTo(x, y + reach); ctx.lineTo(x - radius, y);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};
