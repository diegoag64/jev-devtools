import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const storageKey = "jev-workbench-panel-sizes";
const defaults = { horizontal: 40, vertical: 32 };

/** One divider, with separate remembered proportions for wide and narrow layouts. */
export function SplitPanels({
  code,
  diagram,
}: {
  code: ReactNode;
  diagram: ReactNode;
}) {
  const panels = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  const [sizes, setSizes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      return Object.fromEntries(
        Object.entries(defaults).map(([axis, value]) => [
          axis,
          typeof saved?.[axis] === "number" && Number.isFinite(saved[axis])
            ? Math.max(20, Math.min(75, saved[axis]))
            : value,
        ]),
      ) as typeof defaults;
    } catch {
      return defaults;
    }
  });
  const sizesRef = useRef(sizes);
  const [dragging, setDragging] = useState(false);
  const [limits, setLimits] = useState({ min: 20, max: 75 });
  const axis = stacked ? "vertical" : "horizontal";
  const share = Math.max(limits.min, Math.min(limits.max, sizes[axis]));
  useEffect(() => {
    const query = matchMedia("(max-width: 760px)");
    const change = () => setStacked(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  // Clamp restored proportions before the diagram paints its initial fit.
  useLayoutEffect(() => {
    const panel = panels.current;
    if (!panel) return;
    const measure = () => {
      const rect = panel.getBoundingClientRect();
      const space = Math.max(1, (stacked ? rect.height : rect.width) - 8);
      setLimits({
        min: Math.ceil(
          Math.max(20, Math.min(35, ((stacked ? 100 : 240) / space) * 100)),
        ),
        max: Math.floor(
          Math.min(
            75,
            100 - Math.min(45, ((stacked ? 180 : 300) / space) * 100),
          ),
        ),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, [stacked]);
  function resize(value: number, persist = false) {
    const next = {
      ...sizesRef.current,
      [axis]: Math.max(limits.min, Math.min(limits.max, value)),
    };
    sizesRef.current = next;
    setSizes(next);
    if (persist) save(next);
  }
  function save(value: typeof defaults) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Resizing also works when storage is unavailable. */
    }
  }
  return (
    <div
      ref={panels}
      className="wb-panels"
      data-resizing={dragging || undefined}
      style={{
        gridTemplateColumns: stacked
          ? "minmax(0, 1fr)"
          : `minmax(0, ${share}fr) 8px minmax(0, ${100 - share}fr)`,
        gridTemplateRows: stacked
          ? `minmax(0, ${share}fr) 8px minmax(0, ${100 - share}fr)`
          : "minmax(0, 1fr)",
      }}
    >
      {code}
      <div
        className="wb-divider"
        role="separator"
        tabIndex={0}
        aria-label="Resize code and diagram"
        aria-controls="workbench-code"
        aria-orientation={stacked ? "horizontal" : "vertical"}
        aria-valuemin={limits.min}
        aria-valuemax={limits.max}
        aria-valuenow={Math.round(share)}
        aria-valuetext={`${Math.round(share)}% code, ${Math.round(100 - share)}% diagram`}
        title="Drag to resize · Arrow keys to adjust · Enter or double-click to reset"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (
            !event.currentTarget.hasPointerCapture(event.pointerId) ||
            !panels.current
          )
            return;
          const rect = panels.current.getBoundingClientRect();
          resize(
            (((stacked ? event.clientY - rect.top : event.clientX - rect.left) -
              4) /
              ((stacked ? rect.height : rect.width) - 8)) *
              100,
          );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          setDragging(false);
          save(sizesRef.current);
        }}
        onDoubleClick={() => resize(defaults[axis], true)}
        onKeyDown={(event) => {
          const decrease = stacked ? "ArrowUp" : "ArrowLeft";
          const increase = stacked ? "ArrowDown" : "ArrowRight";
          if (event.key === decrease || event.key === increase) {
            event.preventDefault();
            resize(
              share +
                (event.key === decrease ? -1 : 1) * (event.shiftKey ? 10 : 2),
              true,
            );
          } else if (
            event.key === "Enter" ||
            event.key === "Home" ||
            event.key === "End"
          ) {
            event.preventDefault();
            resize(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 100
                  : defaults[axis],
              true,
            );
          }
        }}
      >
        <span />
      </div>
      {diagram}
    </div>
  );
}
