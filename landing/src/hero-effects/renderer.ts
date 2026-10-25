import "./renderer.css";
import type { PaintEffect } from "./types";

// Independent of the lab UI and effect catalog so a single painter can ship later.
export function mountHeroEffect(target: HTMLElement, initial: PaintEffect) {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-effect-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  const text = target.textContent ?? "";
  target.append(canvas);
  target.classList.add("hero-effect-active");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const contrast = matchMedia("(forced-colors: active)");
  const events = new AbortController();
  let paint = initial, time = 0, speed = 1, paused = false, visible = true;
  let frame = 0, last = 0, width = 0, height = 0, ratio = 1;
  let font = "", letterSpacing = "", baseline = 0;
  function draw() {
    if (!width || !height || !ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    paint(ctx, width, height, time);
    ctx.restore();
    // Mask the animated color field to the same font metrics as the native span.
    ctx.globalCompositeOperation = "destination-in";
    ctx.font = font;
    ctx.letterSpacing = letterSpacing;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    ctx.fillText(text, 0, baseline);
    ctx.globalCompositeOperation = "source-over";
  }
  function active() { return !paused && !motion.matches && !contrast.matches && visible && !document.hidden; }
  function tick(now: number) {
    frame = 0;
    if (!active()) return;
    if (last) time += Math.min((now - last) / 1000, 0.08) * speed;
    last = now;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    draw();
    if (active()) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    width = rect.width; height = rect.height;
    // Supersample the small text mask even on 1× screens to avoid soft fractional edges.
    ratio = 2;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    ctx!.font = font;
    const metrics = ctx!.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    baseline = (height - ascent - descent) / 2 + ascent;
    sync();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(target.parentElement!); // Inline spans have no ResizeObserver content box.
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  intersection.observe(target);
  document.addEventListener("visibilitychange", sync, { signal: events.signal });
  window.addEventListener("resize", resize, { signal: events.signal });
  motion.addEventListener("change", sync, { signal: events.signal });
  contrast.addEventListener("change", sync, { signal: events.signal });
  resize();
  return {
    setEffect(next: PaintEffect) { paint = next; time = 0; sync(); },
    setPaused(value: boolean) { paused = value; sync(); },
    setSpeed(value: number) { speed = value; },
    destroy() {
      cancelAnimationFrame(frame); events.abort(); observer.disconnect(); intersection.disconnect();
      canvas.remove(); target.classList.remove("hero-effect-active");
    },
  };
}
