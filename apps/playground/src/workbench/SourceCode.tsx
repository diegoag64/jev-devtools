import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CookbookDetail, SourceRange } from "./types.js";

import { sourceComments, sourceWithComments } from "./source-comments.js";

export const colors = [
  "#58bfa9",
  "#8c9ff5",
  "#d9ab65",
  "#c78cc5",
  "#78b9d4",
  "#c5b778",
];
export const contains = (range: SourceRange, line: number) =>
  line >= range.start && line <= range.end;
function tokens(line: string) {
  return line
    .split(
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/.*$|\b(?:const|return|import|from|export|type|as|if|else|function|new|throw|true|false|undefined)\b|\b(?:task|jev|if|branch|map|loop|parallel|output|answer)\b|\b\d+(?:\.\d+)?\b)/g,
    )
    .map((part, index) => (
      <span
        key={index}
        className={
          /^["']/.test(part)
            ? "wb-string"
            : part.startsWith("//")
              ? "wb-comment"
              : /^(task|jev|if|branch|map|loop|parallel|output|answer)$/.test(
                    part,
                  )
                ? "wb-method"
                : /^(const|return|import|from|export|type|as|function|new|throw|true|false|undefined)$/.test(
                      part,
                    )
                  ? "wb-keyword"
                  : ""
        }
      >
        {part}
      </span>
    ));
}

export function SourceCode({
  detail,
  active,
  walkthrough,
  selected,
  onSelect,
  onCopyError,
  panelActions,
}: {
  detail: CookbookDetail;
  active: number;
  walkthrough: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onCopyError: () => void;
  panelActions: ReactNode;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [showComments, setShowComments] = useState(() => {
    try {
      return localStorage.getItem("jev-workbench-step-comments") !== "hidden";
    } catch {
      return true;
    }
  });
  const readingPosition = useRef<
    | {
        row: HTMLElement | undefined;
        offset: number;
        left: number;
        atTop: boolean;
      }
    | undefined
  >(undefined);
  function toggleComments() {
    const source = ref.current;
    if (source) {
      const top = source.getBoundingClientRect().top;
      const row = [
        ...source.querySelectorAll<HTMLElement>(".wb-code-line"),
      ].find((line) => line.getBoundingClientRect().bottom > top);
      readingPosition.current = {
        row,
        offset: (row?.getBoundingClientRect().top ?? top) - top,
        left: source.scrollLeft,
        atTop: source.scrollTop === 0,
      };
    }
    const next = !showComments;
    setShowComments(next);
    setCopied(false);
    try {
      localStorage.setItem(
        "jev-workbench-step-comments",
        next ? "shown" : "hidden",
      );
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  }
  useLayoutEffect(() => {
    const saved = readingPosition.current;
    const source = ref.current;
    if (!saved || !source) return;
    // Keep the same original code line in view before the toggle paints.
    if (saved.atTop) source.scrollTop = 0;
    else if (saved.row)
      source.scrollTop +=
        saved.row.getBoundingClientRect().top -
        source.getBoundingClientRect().top -
        saved.offset;
    source.scrollLeft = saved.left;
    readingPosition.current = undefined;
  }, [showComments]);
  const comments = useMemo(() => sourceComments(detail), [detail]);
  const activeRange = walkthrough
    ? detail.steps[active].ranges[0]
    : detail.sourceRanges[selected[0]];
  useEffect(() => {
    if (!activeRange) return;
    const source = ref.current;
    if (!source) return;
    const reveal = () => {
      const node = source.querySelector<HTMLElement>(
        `[data-note-line="${activeRange.start}"], [data-line="${activeRange.start}"]`,
      );
      if (node)
        source.scrollTo({
          top:
            node.getBoundingClientRect().top -
            source.getBoundingClientRect().top +
            source.scrollTop -
            28,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
    };
    if (source.clientHeight) {
      reveal();
      return;
    }
    // A step can change while this pane is hidden. Reveal that step only once
    // the restored pane has measurable rows; later selections replace this one.
    const observer = new ResizeObserver(() => {
      if (source.clientHeight) {
        reveal();
        observer.disconnect();
      }
    });
    observer.observe(source);
    return () => observer.disconnect();
  }, [activeRange?.start, walkthrough]);
  const lineNodes = (line: number) => {
    const matches = Object.entries(detail.sourceRanges).filter(([, range]) =>
      contains(range, line),
    );
    // Prefer the most specific operation when a branch contains other calls.
    const size = Math.min(
      ...matches.map(([, range]) => range.end - range.start),
    );
    return matches
      .filter(([, range]) => range.end - range.start === size)
      .map(([id]) => id);
  };
  function selectText() {
    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !ref.current?.contains(selection.anchorNode) ||
      !ref.current.contains(selection.focusNode)
    )
      return;
    const line = (node: Node | null) => {
      const row = (
        node instanceof Element ? node : node?.parentElement
      )?.closest<HTMLElement>("[data-line], [data-note-line]");
      return Number(row?.dataset.line ?? row?.dataset.noteLine);
    };
    const start = Math.min(
      line(selection.anchorNode),
      line(selection.focusNode),
    );
    const end = Math.max(line(selection.anchorNode), line(selection.focusNode));
    const ids = Object.entries(detail.sourceRanges)
      .filter(([, range]) => range.start <= end && range.end >= start)
      .map(([id]) => id);
    onSelect(ids);
  }
  return (
    <>
      <div className="wb-panel-heading">
        <h2>
          Flow API <span> / flow.ts</span>
        </h2>
        <div className="wb-source-actions">
          <button
            className="wb-comments-toggle"
            aria-label="Step comments"
            aria-pressed={showComments}
            aria-controls="workbench-source"
            title={showComments ? "Hide step comments" : "Show step comments"}
            onClick={toggleComments}
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
              <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 3V6a2 2 0 0 1 2-2Z" />
              <path d="M7 9h10M7 13h6" />
            </svg>
          </button>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(
                  showComments ? sourceWithComments(detail) : detail.source,
                )
                .then(() => setCopied(true))
                .catch(onCopyError);
            }}
          >
            {copied ? "Copied" : "Copy source"}
          </button>
          {panelActions}
        </div>
      </div>
      <pre
        ref={ref}
        id="workbench-source"
        className="wb-source"
        tabIndex={0}
        aria-label="Flow API source"
        onMouseUp={walkthrough ? undefined : selectText}
        onKeyUp={walkthrough ? undefined : selectText}
      >
        <code>
          {detail.source.split("\n").map((line, index) => {
            const number = index + 1;
            const stage = detail.steps.findIndex((step) =>
              step.ranges.some((range) => contains(range, number)),
            );
            const hidden = walkthrough && stage > active;
            if (hidden) {
              if (
                !detail.steps[stage].ranges.some(
                  (range) => range.start === number,
                )
              )
                return null;
              return (
                <span className="wb-code-gap" key={number}>
                  ··· added in step {stage + 1}
                </span>
              );
            }
            const ids = lineNodes(number);
            const highlighted = selected.some(
              (id) =>
                detail.sourceRanges[id] &&
                contains(detail.sourceRanges[id], number),
            );
            return (
              <Fragment key={number}>
                {showComments && comments.has(number) && (
                  <span className="wb-source-note" data-note-line={number}>
                    <span className="wb-line-number" aria-hidden="true" />
                    <span className="wb-comment">
                      {comments.get(number)!.join("\n")}
                      {"\n"}
                    </span>
                  </span>
                )}
                <span
                  data-line={number}
                  className={`wb-code-line ${highlighted ? "is-selected" : ""} ${walkthrough && stage === active ? "is-new" : ""}`}
                  style={
                    {
                      "--step-color":
                        colors[Math.max(0, stage) % colors.length],
                    } as CSSProperties
                  }
                >
                  {walkthrough ? (
                    <span className="wb-line-number" aria-hidden="true">
                      {number}
                    </span>
                  ) : (
                    <button
                      className="wb-line-number"
                      tabIndex={
                        ids.some(
                          (id) => detail.sourceRanges[id].start === number,
                        )
                          ? 0
                          : -1
                      }
                      disabled={!ids.length}
                      aria-label={`Inspect code at line ${number}`}
                      onClick={() => onSelect(ids)}
                    >
                      {number}
                    </button>
                  )}
                  <span>{tokens(line)}</span>
                  {"\n"}
                </span>
              </Fragment>
            );
          })}
        </code>
      </pre>
    </>
  );
}
