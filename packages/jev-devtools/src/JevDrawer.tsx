import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TypeSafeMark } from "./TypeSafeMark.js";
import { createPortal } from "react-dom";
import { inspectorStyles } from "./inspector-styles.js";

const heightKey = "jev-inspector-drawer-height";
const viewportHeight = () =>
  window.visualViewport?.height ?? window.innerHeight;
const limits = (viewport: number) => ({
  min: Math.min(260, viewport - 16),
  max: Math.max(80, viewport - 16),
});
const clamp = (height: number, viewport: number) => {
  const { min, max } = limits(viewport);
  return Math.max(min, Math.min(max, height));
};
function initialHeight() {
  try {
    const saved = Number(localStorage.getItem(heightKey));
    if (Number.isFinite(saved) && saved > 0)
      return clamp(saved, viewportHeight());
  } catch {
    /* Layout persistence is optional. */
  }
  return clamp(Math.min(420, viewportHeight() * 0.56), viewportHeight());
}

/** Non-modal drawer: the app remains usable and children stay mounted when closed. */
export function JevDrawer({
  children,
  open,
  onOpenChange,
}: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewport, setViewport] = useState(viewportHeight);
  const [height, setHeight] = useState(initialHeight);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const interacted = useRef(false);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const { min, max } = limits(viewport);
  const visibleHeight = expanded ? max : clamp(height, viewport);

  useEffect(() => {
    // Retain the diagram and its camera, but suspend native SVG timelines while
    // hidden. This does not change the user's Pause/Play flow preference.
    panel.current?.querySelectorAll("svg").forEach((svg) => {
      if (open) svg.unpauseAnimations();
      else svg.pauseAnimations();
    });
  }, [open, root]);
  useEffect(() => {
    const host = document.createElement("jev-devtools-root");
    // The shadow stylesheet resets the exposed host through :host(), keeping
    // page styles out without an expanded inline reset on the host element.
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = inspectorStyles;
    shadow.append(style);
    document.body.append(host);
    setRoot(shadow);
    return () => host.remove();
  }, []);

  useEffect(() => {
    const resize = () => setViewport(viewportHeight());
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(heightKey, String(height));
    } catch {
      /* Private browsing may disable storage. */
    }
  }, [height]);
  useEffect(() => {
    if (interacted.current)
      (open ? closeButton.current : trigger.current)?.focus();
  }, [open, root]);
  const toggle = (value: boolean) => {
    interacted.current = true;
    onOpenChange(value);
  };
  const resizeTo = (value: number) => {
    setExpanded(false);
    setHeight(clamp(value, viewport));
  };

  if (!root) return null;
  return createPortal(
    <>
      <button
        ref={trigger}
        className="jev-devtools jev-drawer-trigger"
        hidden={open}
        aria-label="Open Jev DevTools"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => toggle(true)}
      >
        <TypeSafeMark /> Jev DevTools
      </button>
      <div
        ref={panel}
        id={id}
        className="jev-devtools jev-drawer"
        hidden={!open}
        role="region"
        aria-label="Jev DevTools"
        style={{ height: visibleHeight }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation();
            toggle(false);
          }
        }}
      >
        <div
          className="jev-drawer-resize"
          role="separator"
          tabIndex={0}
          aria-label="Resize Jev DevTools"
          aria-orientation="horizontal"
          aria-valuemin={Math.round(min)}
          aria-valuemax={Math.round(max)}
          aria-valuenow={Math.round(visibleHeight)}
          aria-valuetext={`${Math.round(visibleHeight)} pixels high`}
          aria-controls={id}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              y: event.clientY,
              height: panel.current!.getBoundingClientRect().height,
            };
          }}
          onPointerMove={(event) => {
            if (drag.current)
              resizeTo(drag.current.height + drag.current.y - event.clientY);
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
            const step = event.shiftKey ? 80 : 20;
            const next =
              event.key === "ArrowUp"
                ? visibleHeight + step
                : event.key === "ArrowDown"
                  ? visibleHeight - step
                  : event.key === "Home"
                    ? min
                    : event.key === "End"
                      ? max
                      : undefined;
            if (next !== undefined) {
              event.preventDefault();
              resizeTo(next);
            }
          }}
        >
          <span />
        </div>
        <header className="jev-drawer-header">
          <strong>
            <TypeSafeMark />
            Jev DevTools
          </strong>
          <div>
            <button
              aria-label={expanded ? "Restore Jev drawer" : "Expand Jev drawer"}
              aria-pressed={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Restore" : "Expand"}
            </button>
            <button
              ref={closeButton}
              className="jev-drawer-close"
              aria-label="Close Jev DevTools"
              title="Close (Esc)"
              onClick={() => toggle(false)}
            >
              ×
            </button>
          </div>
        </header>
        <div className="jev-drawer-content">{children}</div>
      </div>
    </>,
    root,
  );
}
