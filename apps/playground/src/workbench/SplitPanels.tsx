import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const storageKey = "jev-workbench-panel-sizes";
const defaults = { horizontal: 40, vertical: 32 };
type Pane = "code" | "diagram";

/** One divider, with separate remembered proportions for wide and narrow layouts. */
export function SplitPanels({
  code,
  diagram,
  expandedGuide,
}: {
  code: (actions: ReactNode) => ReactNode;
  diagram: (actions: ReactNode) => ReactNode;
  expandedGuide?: ReactNode;
}) {
  const panels = useRef<HTMLDialogElement>(null);
  const [only, setOnly] = useState<Pane>();
  const [expanded, setExpanded] = useState<Pane>();
  const opener = useRef<HTMLButtonElement>(null);
  const snap = useRef<Pane | undefined>(undefined);
  const focusRestore = useRef(false);
  const backdropPress = useRef(false);
  const reading = useRef<{
    row?: HTMLElement;
    offset: number;
    left: number;
    top: number;
  }>(undefined);
  const visiblePane = expanded ?? only;
  function rememberReading() {
    const source = panels.current?.querySelector<HTMLElement>(".wb-source");
    if (!source || !source.clientHeight) return;
    const top = source.getBoundingClientRect().top;
    const row = [
      ...source.querySelectorAll<HTMLElement>(".wb-code-line, .wb-source-note"),
    ].find((line) => line.getBoundingClientRect().bottom > top);
    reading.current = {
      row,
      offset: (row?.getBoundingClientRect().top ?? top) - top,
      left: source.scrollLeft,
      top: source.scrollTop,
    };
  }
  function closeExpanded() {
    rememberReading();
    setExpanded(undefined);
  }
  useLayoutEffect(() => {
    const dialog = panels.current;
    if (!dialog) return;
    if (expanded) {
      // Promote the same mounted panes into the top layer. Portaling a second
      // viewer would discard its request controls and collection selection.
      dialog.removeAttribute("open");
      dialog.showModal();
      dialog
        .querySelector<HTMLButtonElement>("[data-close-expanded]")
        ?.focus({ preventScroll: true });
    } else if (dialog.matches(":modal")) {
      dialog.close();
      dialog.setAttribute("open", "");
      opener.current?.focus({ preventScroll: true });
    }
  }, [expanded]);
  useLayoutEffect(() => {
    const saved = reading.current;
    const source = panels.current?.querySelector<HTMLElement>(".wb-source");
    if (saved && source?.clientHeight) {
      source.scrollTop =
        saved.top === 0
          ? 0
          : source.scrollTop +
            (saved.row?.getBoundingClientRect().top ??
              source.getBoundingClientRect().top) -
            source.getBoundingClientRect().top -
            saved.offset;
      source.scrollLeft = saved.left;
      reading.current = undefined;
    }
    if (only && focusRestore.current) {
      panels.current
        ?.querySelector<HTMLButtonElement>("[data-restore-panels]")
        ?.focus({ preventScroll: true });
      focusRestore.current = false;
    }
  }, [only, expanded]);
  function actions(pane: Pane) {
    return (
      <>
        {!expanded && (
          <button
            className="wb-pane-button"
            data-restore-panels={only === pane || undefined}
            aria-label={only ? "Show both panels" : `Show ${pane} only`}
            title={only ? "Show both panels" : `Show ${pane} only`}
            onClick={() => {
              rememberReading();
              setOnly(only ? undefined : pane);
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M12 4v16" />
              {!only && (
                <path
                  d={pane === "code" ? "M4 5h7v14H4z" : "M13 5h7v14h-7z"}
                  fill="currentColor"
                  opacity=".4"
                  stroke="none"
                />
              )}
            </svg>
          </button>
        )}
        <button
          className="wb-pane-button"
          data-close-expanded={expanded === pane || undefined}
          aria-label={expanded ? `Close expanded ${pane}` : `Expand ${pane}`}
          aria-haspopup={expanded ? undefined : "dialog"}
          title={expanded ? "Close expanded view (Escape)" : `Expand ${pane}`}
          onClick={(event) => {
            if (expanded) closeExpanded();
            else {
              rememberReading();
              opener.current = event.currentTarget;
              setExpanded(pane);
            }
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path
              d={
                expanded
                  ? "m6 6 12 12M6 18 18 6"
                  : "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"
              }
            />
          </svg>
        </button>
      </>
    );
  }
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
  const dragSizes = useRef(sizes);
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
    <dialog
      open
      ref={panels}
      role={expanded ? "dialog" : "region"}
      aria-modal={expanded ? true : undefined}
      aria-label={
        expanded ? `Expanded ${expanded}` : "Code and diagram workspace"
      }
      className="wb-panels"
      data-pane={visiblePane}
      data-expanded={expanded || undefined}
      onCancel={(event) => {
        event.preventDefault();
        closeExpanded();
      }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        backdropPress.current =
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
      }}
      onClick={(event) => {
        if (
          !expanded ||
          !backdropPress.current ||
          event.target !== event.currentTarget
        )
          return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          closeExpanded();
      }}
      data-resizing={dragging || undefined}
      style={{
        gridTemplateColumns:
          visiblePane || stacked
            ? "minmax(0, 1fr)"
            : `minmax(0, ${share}fr) 8px minmax(0, ${100 - share}fr)`,
        gridTemplateRows:
          expanded && expandedGuide
            ? "minmax(0, 1fr) auto"
            : !visiblePane && stacked
              ? `minmax(0, ${share}fr) 8px minmax(0, ${100 - share}fr)`
              : "minmax(0, 1fr)",
      }}
    >
      {code(actions("code"))}
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
        title="Drag to resize or to an edge to hide a pane · Arrow keys to adjust · Enter or double-click to reset"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          snap.current = undefined;
          dragSizes.current = sizesRef.current;
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (
            !event.currentTarget.hasPointerCapture(event.pointerId) ||
            !panels.current
          )
            return;
          const rect = panels.current.getBoundingClientRect();
          const value =
            (((stacked ? event.clientY - rect.top : event.clientX - rect.left) -
              4) /
              ((stacked ? rect.height : rect.width) - 8)) *
            100;
          snap.current =
            value < 8 ? "diagram" : value > 92 ? "code" : undefined;
          if (!snap.current) resize(value);
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          if (snap.current) {
            // Restore the split from before the gesture, not its clamped edge.
            sizesRef.current = dragSizes.current;
            setSizes(dragSizes.current);
            focusRestore.current = true;
            rememberReading();
            setOnly(snap.current);
          }
          event.currentTarget.releasePointerCapture(event.pointerId);
          snap.current = undefined;
        }}
        onPointerCancel={(event) => {
          snap.current = undefined;
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
        <span className="wb-divider-grip" />
      </div>
      {diagram(actions("diagram"))}
      {expanded && expandedGuide}
    </dialog>
  );
}
