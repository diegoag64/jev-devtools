import { type PaintEffect } from "../types";
export const ribbons: PaintEffect = (ctx, w, h, t) => {
  ctx.fillStyle = "#bb9ee6";
  ctx.fillRect(0, 0, w, h);
  const colors = ["#e994cc", "#a6dce6", "#fae1c2", "#e7b2f5", "#91cbbc"];
  for (let i = 0; i < 8; i++) {
    const phase = t * 0.38 + i * 1.4;
    const y = (i - 3) * h * 0.36 + Math.sin(phase) * h * 0.3;
    const bend = Math.sin(phase * 0.8) * h * 1.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, y);
    ctx.bezierCurveTo(w * 0.3, y + h * 2 + bend, w * 0.6, y - h * 1.5 - bend, w * 1.15, y + h * 0.7);
    ctx.lineWidth = h * 0.48;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.stroke();
    ctx.lineWidth = h * 0.025;
    ctx.strokeStyle = "#fff1efb0";
    ctx.stroke();
  }
};
