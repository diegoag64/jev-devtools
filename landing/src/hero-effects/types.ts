export type PaintEffect = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void;
export type HeroEffect = { id: string; name: string; description: string; paint: PaintEffect };
export const wave = (n: number) => (Math.sin(n) + 1) / 2;
