import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  fitCamera,
  zoomCamera,
  type Camera,
  type Point,
} from "./diagram-camera.js";

/** Lab-style camera. Pointer frames update the transform without rerendering cards. */
export function useDiagramViewport(
  width: number,
  height: number,
  scene: string,
  origin: Point = { x: 0, y: 0 },
) {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const size = useRef({ width: 0, height: 0 });
  const fitted = useRef(true);
  const bounds = useRef({ width, height, ...origin });
  useLayoutEffect(() => {
    bounds.current = { width, height, x: origin.x, y: origin.y };
  }, [width, height, origin.x, origin.y]);
  const frame = useRef<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const paint = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const { x, y, scale } = camera.current;
      if (canvas.current)
        canvas.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      if (viewport.current) {
        viewport.current.style.backgroundPosition = `${x}px ${y}px`;
        // Thin out the decorative grid at overview zooms instead of packing
        // more dots behind an increasingly small diagram.
        const grid = 24 * Math.max(scale, 1 / Math.sqrt(scale));
        viewport.current.style.backgroundSize = `${grid}px ${grid}px`;
        viewport.current.style.setProperty(
          "--diagram-grid-opacity",
          String(0.45 * Math.min(1, Math.sqrt(scale))),
        );
        viewport.current.style.setProperty(
          "--diagram-grid-weight",
          String(Math.max(0.5, Math.min(0.75, Math.sqrt(scale)))),
        );
      }
      setZoom(Math.round(scale * 100));
    });
  }, []);
  const fit = useCallback(() => {
    fitted.current = true;
    if (size.current.width <= 0 || size.current.height <= 0) return;
    const fittedCamera = fitCamera(size.current, bounds.current);
    camera.current = {
      ...fittedCamera,
      x: fittedCamera.x - bounds.current.x * fittedCamera.scale,
      y: fittedCamera.y - bounds.current.y * fittedCamera.scale,
    };
    paint();
  }, [paint]);
  const preserveCamera = useCallback(() => {
    fitted.current = false;
  }, []);
  const focusArea = useCallback(
    (area: Point & { width: number; height: number }) => {
      fitted.current = false;
      const focused = fitCamera(size.current, area);
      camera.current = {
        ...focused,
        x: focused.x - area.x * focused.scale,
        y: focused.y - area.y * focused.scale,
      };
      paint();
    },
    [paint],
  );
  useEffect(() => {
    if (fitted.current) fit();
  }, [width, height, origin.x, origin.y, fit]);
  const zoomBy = useCallback(
    (factor: number, point?: Point) => {
      fitted.current = false;
      camera.current = zoomCamera(
        camera.current,
        factor,
        point ?? { x: size.current.width / 2, y: size.current.height / 2 },
      );
      paint();
    },
    [paint],
  );

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const pointers = new Map<number, Point>();
    const local = (event: { clientX: number; clientY: number }): Point => {
      const rect = el.getBoundingClientRect();
      return {
        x: event.clientX - rect.left - el.clientLeft,
        y: event.clientY - rect.top - el.clientTop,
      };
    };
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      if (next.width <= 0 || next.height <= 0) return; // Closed drawer.
      const previous = size.current;
      size.current = next;
      if (fitted.current) fit();
      else {
        camera.current.x += (next.width - previous.width) / 2;
        camera.current.y += (next.height - previous.height) / 2;
        paint();
      }
    };
    const down = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        pointers.size >= 2 ||
        (event.target as Element).closest(
          "button, input, select, textarea, a, summary, [data-diagram-scroll]",
        )
      )
        return;
      event.preventDefault();
      el.focus({ preventScroll: true });
      el.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(event));
      el.dataset.panning = "true";
    };
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      const before = [...pointers.values()];
      pointers.set(event.pointerId, local(event));
      const after = [...pointers.values()];
      fitted.current = false;
      if (before.length === 1) {
        camera.current.x += after[0].x - before[0].x;
        camera.current.y += after[0].y - before[0].y;
      } else {
        const center = (p: Point[]) => ({
          x: (p[0].x + p[1].x) / 2,
          y: (p[0].y + p[1].y) / 2,
        });
        const distance = (p: Point[]) =>
          Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        camera.current = zoomCamera(
          camera.current,
          distance(after) / Math.max(1, distance(before)),
          center(before),
          center(after),
        );
      }
      paint();
    };
    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (el.hasPointerCapture(event.pointerId))
        el.releasePointerCapture(event.pointerId);
      if (!pointers.size) delete el.dataset.panning;
    };
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest("[data-diagram-scroll]")) return;
      event.preventDefault();
      const units =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? el.clientHeight
            : 1;
      // Match the lab viewer's anchored wheel/pinch zoom, including trackpads.
      zoomBy(
        Math.exp(
          -Math.max(-100, Math.min(100, event.deltaY * units)) *
            (event.ctrlKey ? 0.01 : 0.003),
        ),
        local(event),
      );
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.target !== el) return;
      const step = event.shiftKey ? 100 : 40;
      if (event.key === "+" || event.key === "=") zoomBy(1.2);
      else if (event.key === "-") zoomBy(1 / 1.2);
      else if (event.key === "0" || event.key === "Home") fit();
      else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        fitted.current = false;
        if (event.key === "ArrowLeft") camera.current.x += step;
        if (event.key === "ArrowRight") camera.current.x -= step;
        if (event.key === "ArrowUp") camera.current.y += step;
        if (event.key === "ArrowDown") camera.current.y -= step;
        paint();
      } else return;
      event.preventDefault();
    };
    fitted.current = true;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", keydown);
    return () => {
      observer.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("lostpointercapture", release);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", keydown);
      for (const pointer of pointers.keys())
        if (el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
      pointers.clear();
      delete el.dataset.panning;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [fit, zoomBy, paint, scene]);
  return { viewport, canvas, zoom, zoomBy, fit, preserveCamera, focusArea };
}
