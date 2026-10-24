import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Keep metadata out of the canvas until requested; size it within the flow workspace. */
export function FlowDetailsPanel({
  children,
  selection,
  onLayoutChange,
}: {
  children: ReactNode;
  selection?: string;
  onLayoutChange: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(240);
  const [max, setMax] = useState(0);
  const min = Math.min(96, max);
  const visibleHeight = Math.max(min, Math.min(max, height));

  useEffect(() => {
    const workspace = panel.current?.parentElement;
    if (!workspace) return;
    const measure = () => {
      const available = workspace.clientHeight;
      // Leave room for the bar/divider and a usable canvas, including short drawers.
      setMax(Math.max(0, available - Math.min(140, available * 0.45) - 44));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  const resize = (next: number) => {
    onLayoutChange();
    setHeight(Math.max(min, Math.min(max, next)));
  };

  return (
    <div className="flow-details-panel" ref={panel}>
      {open && (
        <div
          className="flow-details-resize"
          role="separator"
          tabIndex={0}
          aria-label="Resize flow details"
          aria-orientation="horizontal"
          aria-controls={id}
          aria-valuemin={Math.round(min)}
          aria-valuemax={Math.round(max)}
          aria-valuenow={Math.round(visibleHeight)}
          aria-valuetext={`${Math.round(visibleHeight)} pixels high`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { y: event.clientY, height: visibleHeight };
          }}
          onPointerMove={(event) => {
            if (drag.current)
              resize(drag.current.height + drag.current.y - event.clientY);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const increment = event.shiftKey ? 80 : 20;
            const next =
              event.key === "ArrowUp"
                ? visibleHeight + increment
                : event.key === "ArrowDown"
                  ? visibleHeight - increment
                  : event.key === "Home"
                    ? min
                    : event.key === "End"
                      ? max
                      : undefined;
            if (next !== undefined) {
              event.preventDefault();
              event.stopPropagation();
              resize(next);
            }
          }}
        >
          <span />
        </div>
      )}
      <div className="flow-details-bar">
        <button
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            onLayoutChange();
            setOpen(!open);
          }}
        >
          {open ? "Hide details" : "Show details"}
        </button>
        {selection && <span title={selection}>{selection}</span>}
      </div>
      <div
        id={id}
        hidden={!open}
        className="flow-details-body"
        role="region"
        aria-label="Flow details"
        tabIndex={0}
        style={{ height: visibleHeight }}
      >
        {open && children}
      </div>
    </div>
  );
}
