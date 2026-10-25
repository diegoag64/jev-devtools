import { pool, type PaintEffect } from "../types";
export const pearl: PaintEffect = (ctx, w, h, t) => {
  ctx.fillStyle = "#e69bd2";
  ctx.fillRect(0, 0, w, h);
  const colors = ["#ffe6d0", "#b9b7fc", "#f6c1e5", "#c8e8e3"];
  colors.forEach((color, i) => {
    const x = w * (0.5 + 0.48 * Math.sin(t * 0.2 + i * 1.8));
    const y = h * (0.5 + 0.3 * Math.cos(t * 0.28 + i));
    pool(ctx, x, y, w * 0.28, color);
  });
};
