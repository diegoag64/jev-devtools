import type { CookbookDetail } from "./types.js";

/** Attach notes to original source lines so toggling them cannot change node IDs. */
export function sourceComments(
  detail: Pick<CookbookDetail, "source" | "steps">,
) {
  const lines = detail.source.split("\n");
  const comments = new Map<number, string[]>();
  for (const step of detail.steps) {
    const start = step.ranges[0].start;
    const indent = lines[start - 1].match(/^\s*/)?.[0] ?? "";
    const prefix = `${indent}// `;
    const wrapped: string[] = [];
    let line = prefix;
    for (const word of step.comment.split(/\s+/)) {
      if (line !== prefix && line.length + word.length + 1 > 76) {
        wrapped.push(line);
        line = prefix;
      }
      line += `${line === prefix ? "" : " "}${word}`;
    }
    wrapped.push(line);
    comments.set(start, [...(comments.get(start) ?? []), ...wrapped]);
  }
  return comments;
}

export function sourceWithComments(
  detail: Pick<CookbookDetail, "source" | "steps">,
) {
  const comments = sourceComments(detail);
  return detail.source
    .split("\n")
    .flatMap((line, index) => [...(comments.get(index + 1) ?? []), line])
    .join("\n");
}
