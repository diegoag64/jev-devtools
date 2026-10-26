import { readFileSync } from "node:fs";
import { choice, noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import {
  isLineSearchCase,
  lineSearchCases,
  type LineSearchCase,
} from "./cases.js";

// The trailing newline terminates the final line; it is not another Choice option.
export const sourceLines = readFileSync(
  new URL("./github-tos.txt", import.meta.url),
  "utf8",
)
  .trimEnd()
  .split(/\r?\n/);
export const lineId = (index: number) => `L${String(index).padStart(3, "0")}`;
export function tagLines(lines: string[]) {
  if (lines.length < 2 || lines.length > 255)
    throw new Error("Choice requires 2–255 document lines");
  return lines.map((text, index) => ({ id: lineId(index), text }));
}
export function searchRequest(
  query: string,
  lines: { id: string; text: string }[],
) {
  return {
    model: "jev-1.12",
    state: lines.map(({ id, text }) => `${id}| ${text}`).join("\n"),
    questions: {
      where: choice(
        `Which line of the document contains the answer to: "${query}"?`,
        Object.fromEntries(lines.map(({ id }) => [id, null])),
      ),
      exists: noul(
        `Does any line of the document address or answer: "${query}"?`,
        {
          true: "At least one line of the document states or directly implies the answer",
          false: "No line of the document addresses this",
        },
      ),
    },
  };
}
export type LineSearchResult = {
  query: string;
  exists: number;
  confidence: number;
  relevance: number[];
  ranked: { id: string; text: string; probability: number }[];
};
type Input = { message: string; caseId: LineSearchCase };
export const lineSearchFlow = defineJevFlow<Input>(
  "Cookbook · Line-by-line search",
  (flow) => {
    const lines = flow.task(
      "tag-lines",
      {
        input: flow.input,
        run: ({ caseId, message }) => {
          if (
            !isLineSearchCase(caseId) ||
            message !== lineSearchCases[caseId].message
          )
            throw new Error("No line-search sample matches this query");
          return tagLines(sourceLines);
        },
      },
      {
        title: "Tag every document line",
        description:
          "Assign L000–L217 within this pinned document. Preserve all original lines and their order.",
      },
    );
    const search = flow.jev(
      "find",
      {
        input: { query: flow.input.get("message"), lines },
        request: ({ query, lines }) => searchRequest(query, lines),
      },
      {
        title: "Rank lines and check existence",
        description:
          "One request: Choice probabilities rank all lines; a separate Noul checks whether any line answers the query. Synthetic responses, no live inference.",
      },
    );
    const ranking = flow.task(
      "rank-lines",
      {
        input: { lines, probabilities: search.answer("where").probabilities },
        run: ({ lines, probabilities }) => {
          const relevance = lines.map(({ id }) => probabilities[id] ?? 0);
          return {
            relevance,
            indices: lines
              .map((_, i) => i)
              .sort((a, b) => relevance[b] - relevance[a]),
          };
        },
      },
      {
        title: "Sort by Choice probability",
        description:
          "Keep relevance in document order; sort a separate index list descending. Ties retain document order. Missing line probabilities default to zero, as in the source.",
      },
    );
    const result = flow.task(
      "lookup-lines",
      {
        input: {
          lines,
          ranking,
          query: flow.input.get("message"),
          exists: search.answer("exists").noul,
          confidence: search.answer("where").confidence,
        },
        run: ({
          lines,
          ranking,
          query,
          exists,
          confidence,
        }): LineSearchResult => ({
          query,
          exists,
          confidence,
          relevance: ranking.relevance,
          ranked: ranking.indices.map((i) => ({
            ...lines[i],
            probability: ranking.relevance[i],
          })),
        }),
      },
      {
        title: "Look up the ranked source lines",
        description:
          "Resolve IDs to the complete source text. Return every option to the result UI; capture previews may be bounded.",
      },
    );
    return flow.branch(
      "answer-exists",
      {
        when: search.answer("exists").noul.gte(0.7),
        then: (path) =>
          path.output("answered", result, {
            title: "Answered in this document",
          }),
        else: (path) =>
          path.branch(
            "answer-absent",
            {
              when: search.answer("exists").noul.lt(0.35),
              then: (p) =>
                p.output("absent", result, { title: "Not in this document" }),
              else: (p) =>
                p.output("partial", result, { title: "Partially addressed" }),
            },
            {
              title: "Existence below 0.35?",
              description:
                "Below 0.35 means absent. Exactly 0.35 up to (but excluding) 0.70 means partial.",
            },
          ),
      },
      {
        title: "Existence at least 0.70?",
        description:
          "Route on Noul existence only. The winning Choice line and API confidence never establish that an answer exists.",
      },
    );
  },
);
