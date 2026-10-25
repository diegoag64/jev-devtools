import "./renderer.css";
import type { PaintEffect } from "./types";

export function mountHeroEffect(target: HTMLElement, paint: PaintEffect) {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-effect-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  // Keep the solid native text if canvas cannot match the title's letter spacing.
  if (!ctx || !("letterSpacing" in ctx)) return () => {};
  const text = target.textContent ?? "";
  target.append(canvas);
  target.classList.add("hero-effect-active");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const contrast = matchMedia("(forced-colors: active)");
  const events = new AbortController();
  let time = 0, visible = true, destroyed = false;
  let frame = 0, last = 0, width = 0, height = 0;
  let font = "", letterSpacing = "", baseline = 0;
  const ratio = 2;

  function draw() {
    if (destroyed || !width || !height || !ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    paint(ctx, width, height, time);
    ctx.restore();
    // Clip the color field to the native text's metrics, preserving accessible text.
    ctx.globalCompositeOperation = "destination-in";
    ctx.font = font;
    ctx.letterSpacing = letterSpacing;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    ctx.fillText(text, 0, baseline);
    ctx.globalCompositeOperation = "source-over";
  }
  function active() {
    return !destroyed && !motion.matches && !contrast.matches && visible && !document.hidden;
  }
  function tick(now: number) {
    frame = 0;
    if (!active()) return;
    if (last) time += Math.min((now - last) / 1000, 0.08);
    last = now;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    draw();
    if (active()) frame = requestAnimationFrame(tick);
  }
  function resize() {
    if (destroyed) return;
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    width = rect.width;
    height = rect.height;
    // Supersample even on 1× screens to avoid soft fractional text edges.
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    ctx!.font = font;
    const metrics = ctx!.measureText(text);
    baseline = (height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
    sync();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(target.parentElement!); // Inline spans have no ResizeObserver content box.
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  intersection.observe(target);
  document.addEventListener("visibilitychange", sync, { signal: events.signal });
  window.addEventListener("resize", resize, { signal: events.signal });
  motion.addEventListener("change", sync, { signal: events.signal });
  contrast.addEventListener("change", sync, { signal: events.signal });
  resize();
  return () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    events.abort();
    observer.disconnect();
    intersection.disconnect();
    canvas.remove();
    target.classList.remove("hero-effect-active");
  };
}
