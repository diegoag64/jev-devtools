import { random, type PaintEffect } from "../types";
export const paint: PaintEffect = (ctx, w, h, t) => {
  ctx.fillStyle = "#edb7dd";
  ctx.fillRect(0, 0, w, h);
  const colors = ["#ff858e", "#b9a0ff", "#8ee0ce", "#f7d38e", "#ed84ce"];
  // Deterministic splashes bloom in succession, then dissolve into the next pass.
  for (let i = 0; i < 18; i++) {
    const age = (t + i * 1.17 + 4) % 14;
    const grow = 1 - Math.pow(1 - Math.min(age / 1.4, 1), 3);
    const opacity = Math.min(1, (14 - age) / 2.5);
    const radius = h * (0.32 + random(i + 5) * 0.55);
    ctx.save();
    ctx.translate(w * random(i + 1), h * random(i + 40));
    ctx.scale(grow, grow);
    ctx.globalAlpha = opacity * 0.95;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    for (let j = 0; j <= 40; j++) {
      const angle = j / 40 * Math.PI * 2;
      const r = radius * (0.63 + random(i * 50 + j % 40) * 0.37);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    for (let j = 0; j < 9; j++) {
      const angle = random(i * 70 + j) * Math.PI * 2;
      const distance = radius * (1.05 + random(i * 80 + j) * 0.65);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, h * (0.008 + random(i * 90 + j) * 0.025), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};
