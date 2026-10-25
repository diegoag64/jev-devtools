import { random, wave, type PaintEffect } from "../types";

export const crystal: PaintEffect = (ctx, w, h, t) => {
  ctx.fillStyle = "#dfb9ed";
  ctx.fillRect(0, 0, w, h);
  const cols = 9, rows = 3;
  const point = (col: number, row: number): [number, number] => [
    col / cols * w + (col > 0 && col < cols ? (random(col * 30 + row) - 0.5) * w / cols * 0.7 : 0),
    row / rows * h + (row > 0 && row < rows ? (random(col + row * 40) - 0.5) * h / rows * 0.7 : 0),
  ];
  // Fixed geometry, moving light: facets change color without moving the letterforms.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = point(col, row), b = point(col + 1, row);
      const c = point(col, row + 1), d = point(col + 1, row + 1);
      const triangles = (row + col) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
      triangles.forEach((vertices, side) => {
        const seed = row * cols * 2 + col * 2 + side;
        const light = wave(t * 0.45 + seed * 0.8);
        const hue = 210 + wave(t * 0.2 + col * 0.6 + row * 1.4 + side * 0.5) * 145;
        const gradient = ctx.createLinearGradient(vertices[0][0], vertices[0][1], vertices[2][0] + 1, vertices[2][1] + 1);
        gradient.addColorStop(0, `hsl(${hue} 70% ${69 + light * 16}%)`);
        gradient.addColorStop(1, `hsl(${hue + 25} 65% ${79 + light * 10}%)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        vertices.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = `rgba(255, 244, 231, ${0.08 + light ** 8 * 0.4})`;
        ctx.stroke();
      });
    }
  }
};
