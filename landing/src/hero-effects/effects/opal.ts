import { wave, type PaintEffect } from "../types";

export const opal: PaintEffect = (ctx, w, h, t) => {
  ctx.fillStyle = "#d0b9eb";
  ctx.fillRect(0, 0, w, h);
  const centerX = w * (0.44 + Math.sin(t * 0.18) * 0.2);
  const centerY = h * (0.8 + Math.cos(t * 0.24) * 0.7);
  // Nested, irregular shells give the rolling color of mother-of-pearl.
  for (let ring = 22; ring >= 1; ring--) {
    const radius = ring * h * 0.22;
    const hue = 210 + wave(ring * 0.6 - t * 0.35) * 140;
    const bright = wave(ring * 1.9 - t * 0.5);
    ctx.fillStyle = `hsl(${hue} ${50 + bright * 22}% ${74 + bright * 14}%)`;
    ctx.beginPath();
    for (let step = 0; step <= 80; step++) {
      const angle = step / 80 * Math.PI * 2;
      const ripple = 1 + Math.sin(angle * 3 + t * 0.24) * 0.06 + Math.cos(angle * 5 - t * 0.2) * 0.04;
      const x = centerX + Math.cos(angle) * radius * ripple * 1.7;
      const y = centerY + Math.sin(angle) * radius * ripple;
      if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, h * 0.007);
    ctx.strokeStyle = `rgba(255, 242, 219, ${0.15 + bright * 0.4})`;
    ctx.stroke();
  }
};
