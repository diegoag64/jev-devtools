/** Pure calibration strip layout; the browser panel renders its output. */
export type StripValue = { runId: string; value: number };
export type StripDot = StripValue & { x: number; slot: number };
export type StripLayout = {
  dots: StripDot[];
  /** Hidden dots past the cap, grouped near the x of the first one hidden. */
  overflow: { x: number; count: number }[];
  /** Largest |slot| in use: 0 means a single row on the axis. */
  reach: number;
};

// Slot order: on the axis, then alternating above and below.
const slots = (cap: number) =>
  Array.from({ length: cap }, (_, i) => (i % 2 ? -(i + 1) / 2 : i / 2));

/**
 * Beeswarm layout: every dot keeps its own x; collisions only move a dot to
 * another row. The selected run is placed first so it is always shown on the
 * axis. Output is deterministic: values sort by value, then run id.
 */
export function stripLayout(
  values: readonly StripValue[],
  x: (value: number) => number,
  diameter: number,
  selected?: string,
  cap = 5,
): StripLayout {
  const order = [...values].sort(
    (a, b) =>
      Number(b.runId === selected) - Number(a.runId === selected) ||
      a.value - b.value ||
      (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0),
  );
  const dots: StripDot[] = [];
  const overflow: StripLayout["overflow"] = [];
  for (const v of order) {
    const px = x(v.value);
    const slot = slots(cap).find(
      (s) => !dots.some((d) => d.slot === s && Math.abs(d.x - px) < diameter),
    );
    if (slot !== undefined) {
      dots.push({ ...v, x: px, slot });
      continue;
    }
    const group = overflow.find((o) => Math.abs(o.x - px) < diameter);
    if (group) group.count++;
    else overflow.push({ x: px, count: 1 });
  }
  return {
    dots,
    overflow,
    reach: Math.max(0, ...dots.map((d) => Math.abs(d.slot))),
  };
}

const clamp = (v: number) =>
  Math.min(Number.MAX_VALUE, Math.max(-Number.MAX_VALUE, v));
/**
 * Axis 6..294 for a 300px strip. Probabilities span 0..1; other scales span the
 * points with 8% padding. Works on halves so extreme spans can't overflow, and
 * puts every point at the center when the span is unusable. x() is always finite.
 */
export function stripScale(points: readonly number[], probability: boolean) {
  const finite = points.filter(Number.isFinite);
  let [min, max] =
    probability || !finite.length
      ? [0, 1]
      : [Math.min(...finite), Math.max(...finite)];
  if (!probability && finite.length) {
    const pad = (max / 2 - min / 2) * 0.16 || Math.abs(max) * 0.1 || 1;
    [min, max] = [clamp(min - pad), clamp(max + pad)];
  }
  const half = max / 2 - min / 2;
  const usable = half > 0 && Number.isFinite(half);
  const x = (v: number) => {
    if (!usable || !Number.isFinite(v)) return 150;
    const ratio = (Math.min(max, Math.max(min, v)) / 2 - min / 2) / half;
    return Number.isFinite(ratio) ? 6 + 288 * ratio : 150;
  };
  return { min, max, x };
}
