export type PaintEffect = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void;
export const wave = (n: number) => (Math.sin(n) + 1) / 2;
