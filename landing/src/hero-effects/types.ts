export type PaintEffect = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void;
export type HeroEffect = { id: string; name: string; description: string; paint: PaintEffect };
export const wave = (n: number) => (Math.sin(n) + 1) / 2;
export const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
