import { useEffect, useRef, type CSSProperties } from "react";
import type { CookbookDetail, SourceRange } from "./types.js";

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
}: {
  detail: CookbookDetail;
  active: number;
  walkthrough: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const activeRange =
    detail.sourceRanges[selected[0]] ?? detail.steps[active].ranges[0];
  useEffect(() => {
    const node = ref.current?.querySelector<HTMLElement>(
      `[data-line="${activeRange.start}"]`,
    );
    if (node && ref.current)
      ref.current.scrollTo({
        top:
          node.getBoundingClientRect().top -
          ref.current.getBoundingClientRect().top +
          ref.current.scrollTop -
          28,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [activeRange.start, walkthrough]);
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
    const line = (node: Node | null) =>
      Number(
        (node instanceof Element
          ? node
          : node?.parentElement
        )?.closest<HTMLElement>("[data-line]")?.dataset.line,
      );
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
    <pre
      ref={ref}
      className="wb-source"
      tabIndex={0}
      aria-label="Flow API source"
      onMouseUp={selectText}
      onKeyUp={selectText}
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
            <span
              key={number}
              data-line={number}
              className={`wb-code-line ${highlighted ? "is-selected" : ""} ${walkthrough && stage === active ? "is-new" : ""}`}
              style={
                {
                  "--step-color": colors[Math.max(0, stage) % colors.length],
                } as CSSProperties
              }
            >
              <button
                tabIndex={
                  ids.some((id) => detail.sourceRanges[id].start === number)
                    ? 0
                    : -1
                }
                disabled={!ids.length}
                aria-label={`Inspect code at line ${number}`}
                onClick={() => onSelect(ids)}
              >
                {number}
              </button>
              <span>{tokens(line)}</span>
              {"\n"}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
