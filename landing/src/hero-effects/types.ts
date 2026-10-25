export type PaintEffect = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void;
export type HeroEffect = { id: string; name: string; description: string; paint: PaintEffect };
export const wave = (n: number) => (Math.sin(n) + 1) / 2;
export const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export function pool(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  // Fade the same RGB color to zero alpha; transparent black muddies canvas gradients.
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
