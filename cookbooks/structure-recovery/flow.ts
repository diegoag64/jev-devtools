import { readFileSync } from "node:fs";
import { choice, noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import {
  isStructureCase,
  structureCases,
  type StructureCase,
} from "./cases.js";
const criteria: Record<
  "TYPE_CRITERIA" | "HLEVEL_CRITERIA" | "CALLOUT_CRITERIA",
  Record<string, string>
> = JSON.parse(
  readFileSync(new URL("./criteria.json", import.meta.url), "utf8"),
);
export type Line = { text: string; gap: boolean };
export type Block = Line & { lines: number[] };
export type Kind =
  | "heading"
  | "paragraph"
  | "list_item"
  | "quote"
  | "code"
  | "callout";
export type Judgment = {
  type: Kind;
  confidence: number;
  probabilities: Record<string, number>;
  hlevel: string;
  step: number;
  callout: string;
};
export type JoinDecision = {
  line: number;
  probability: number | null;
  threshold: number;
  merged: boolean;
  reason: string;
};
export type RenderGroup = {
  kind: Kind;
  blocks: number[];
  ordered: boolean;
  meanStep: number | null;
  markdown: string;
};
export type StructureResult = {
  original: string;
  lines: Line[];
  joins: JoinDecision[];
  blocks: (Block & Judgment)[];
  groups: RenderGroup[];
  markdown: string;
  stitchQuestions: number;
  classifyQuestions: number;
};
const id = (prefix: string, i: number) =>
  `${prefix}${String(i).padStart(3, "0")}`;
export function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let gap = false;
  for (const raw of text.split("\n")) {
    const stripped = raw.replace(/[\t ]+/g, " ").trim();
    if (!stripped) {
      gap = lines.length > 0;
      continue;
    }
    lines.push({ text: stripped, gap });
    gap = false;
  }
  return lines;
}
function tag(items: Line[], prefix: string) {
  return items
    .map((line, i) => `${line.gap ? "\n" : ""}${id(prefix, i)}| ${line.text}`)
    .join("\n");
}
export function stitchRequest(lines: Line[]) {
  const questions: Record<string, ReturnType<typeof noul>> = {};
  for (let i = 1; i < lines.length; i++)
    if (!lines[i].gap)
      questions[id("L", i)] = noul(
        `Does line ${id("L", i)} pick up mid-sentence, continuing a sentence left unfinished at the end of line ${id("L", i - 1)}?`,
        {
          true: "The line starts in the middle of a sentence that began on the previous line - the line break tore the sentence apart",
          false:
            "The line begins a new sentence, item, heading, or thought of its own",
        },
      );
  return { model: "jev-1.12", state: tag(lines, "L"), questions };
}
export function classifyRequest(blocks: Line[]) {
  const questions: Record<
    string,
    ReturnType<typeof noul> | ReturnType<typeof choice>
  > = {};
  blocks.forEach((b, i) => {
    const bid = id("B", i);
    questions[`type_${bid}`] = choice(
      `What kind of content is block ${bid}?`,
      criteria.TYPE_CRITERIA,
    );
    if ([...b.text].length <= 90)
      questions[`hlevel_${bid}`] = choice(
        `As a heading, what level would block ${bid} occupy in this document's structure?`,
        criteria.HLEVEL_CRITERIA,
      );
    questions[`step_${bid}`] = noul(
      `Is block ${bid} an instruction in a sequence where the order of the items matters?`,
      {
        true: "It is one step of a procedure - the items around it must happen in order",
        false:
          "Order is irrelevant - it is a loose collection, or not a list item at all",
      },
    );
    questions[`callout_${bid}`] = choice(
      `What kind of aside is block ${bid}?`,
      criteria.CALLOUT_CRITERIA,
    );
  });
  return { model: "jev-1.12", state: tag(blocks, "B"), questions };
}
function mergeLines(lines: Line[], probabilities: number[]) {
  const blocks: Block[] = [],
    joins: JoinDecision[] = [];
  lines.forEach((line, i) => {
    const threshold =
      i && /[.!?:;…]["')\]]*$/.test(lines[i - 1].text) ? 0.5 : 0.2;
    const asked = i > 0 && !line.gap;
    const merged = asked && probabilities[i] >= threshold;
    joins.push({
      line: i,
      probability: asked ? probabilities[i] : null,
      threshold,
      merged,
      reason:
        i === 0
          ? "First line"
          : line.gap
            ? "Blank line · never join"
            : merged
              ? "Meets join threshold"
              : "Below join threshold",
    });
    if (merged) {
      blocks.at(-1)!.text += ` ${line.text}`;
      blocks.at(-1)!.lines.push(i);
    } else blocks.push({ ...line, lines: [i] });
  });
  return { blocks, joins };
}
function renderBlocks(blocks: (Block & Judgment)[]) {
  const groups: RenderGroup[] = [];
  blocks.forEach((b, i) => {
    const last = groups.at(-1);
    if ((b.type === "list_item" || b.type === "code") && last?.kind === b.type)
      last.blocks.push(i);
    else
      groups.push({
        kind: b.type,
        blocks: [i],
        ordered: false,
        meanStep: null,
        markdown: "",
      });
  });
  for (const group of groups) {
    const items = group.blocks.map((i) => blocks[i]),
      b = items[0];
    if (group.kind === "list_item") {
      group.meanStep =
        items.reduce((sum, item) => sum + item.step, 0) / items.length;
      group.ordered = group.meanStep >= 0.5;
      group.markdown = items
        .map((item, i) => `${group.ordered ? `${i + 1}.` : "-"} ${item.text}`)
        .join("\n");
    } else if (group.kind === "code")
      group.markdown =
        "```\n" + items.map((item) => item.text).join("\n") + "\n```";
    else if (group.kind === "heading")
      group.markdown = `${({ title: "#", section: "##", subsection: "###" } as Record<string, string>)[b.hlevel]} ${b.text}`;
    else if (group.kind === "quote") group.markdown = `> ${b.text}`;
    else if (group.kind === "callout")
      group.markdown = `> [!${b.callout.toUpperCase()}]\n> ${b.text}`;
    else group.markdown = b.text;
  }
  return {
    groups,
    markdown: groups.length
      ? groups.map((g) => g.markdown).join("\n\n") + "\n"
      : "",
  };
}
export const structureFlow = defineJevFlow<{
  message: string;
  caseId: StructureCase;
}>("Cookbook · Structure recovery", (flow) => {
  const prepared = flow.task(
    "prepare-lines",
    {
      input: flow.input,
      run: ({ message, caseId }) => {
        if (
          !isStructureCase(caseId) ||
          message !== structureCases[caseId].message
        )
          throw new Error("No structure sample matches this document");
        const lines = toLines(message);
        return {
          lines,
          stitchQuestions: Object.keys(stitchRequest(lines).questions).length,
        };
      },
    },
    {
      title: "Normalize and tag lines",
      description:
        "Collapse horizontal whitespace, preserve blank-line boundaries and assign line IDs. No model generates or rewrites text.",
    },
  );
  const joins = flow.if(
    "has-adjacent-pairs",
    {
      when: prepared.get("stitchQuestions").gt(0),
      then: (path) => {
        const response = path.jev(
          "stitch-lines",
          { input: prepared.get("lines"), request: stitchRequest },
          {
            title: "Pass 1 · stitch split sentences",
            description:
              "One batched Noul request. Blank-line boundaries are excluded from the questions.",
          },
        );
        return path.task(
          "read-joins",
          {
            input: { lines: prepared.get("lines"), answers: response.answers },
            run: ({ lines, answers }) =>
              lines.map((line, i) =>
                i > 0 && !line.gap ? answers[id("L", i)].noul : 0,
              ),
          },
          {
            title: "Read line-pair probabilities",
            description:
              "Keep the Noul values for asked pairs. Blank-line boundaries have no inferred join probability.",
          },
        );
      },
      else: (path) =>
        path.task(
          "skip-stitching",
          { input: prepared.get("lines"), run: (lines) => lines.map(() => 0) },
          {
            title: "No adjacent pairs",
            description:
              "No stitching request is needed. Keep the existing boundaries.",
          },
        ),
    },
    { title: "Are there adjacent nonblank lines?" },
  );
  const merged = flow.task(
    "merge-lines",
    {
      input: { lines: prepared.get("lines"), probabilities: joins },
      run: ({ lines, probabilities }) => mergeLines(lines, probabilities),
    },
    {
      title: "Restore text blocks",
      description:
        "Join at ≥20% after unfinished text or ≥50% after terminal punctuation. Never cross a blank line.",
    },
  );
  const classified = flow.if(
    "has-blocks",
    {
      when: merged.get("blocks").get("length").gt(0),
      then: (path) => {
        const response = path.jev(
          "classify-blocks",
          { input: merged.get("blocks"), request: classifyRequest },
          {
            title: "Pass 2 · classify recovered blocks",
            description:
              "One dynamic batch: content type plus heading, step-order and callout companions. Only relevant companions affect rendering.",
          },
        );
        return path.task(
          "read-classification",
          {
            input: { blocks: merged.get("blocks"), answers: response.answers },
            run: ({ blocks, answers }) =>
              blocks.map((block, i): Block & Judgment => {
                const bid = id("B", i),
                  type = answers[`type_${bid}`],
                  level = answers[`hlevel_${bid}`],
                  step = answers[`step_${bid}`],
                  aside = answers[`callout_${bid}`];
                if (
                  type.type !== "choice" ||
                  step.type !== "noul" ||
                  aside.type !== "choice" ||
                  (level && level.type !== "choice")
                )
                  throw new Error("Unexpected block answer type");
                return {
                  ...block,
                  type: type.choice as Kind,
                  confidence: type.confidence,
                  probabilities: type.probabilities,
                  hlevel: level?.choice ?? "section",
                  step: step.noul,
                  callout: aside.choice,
                };
              }),
          },
          {
            title: "Attach block judgments",
            description:
              "Keep the returned content type, confidence, all type probabilities and companion answers alongside each source block.",
          },
        );
      },
      else: (path) =>
        path.task(
          "empty-document",
          { input: merged.get("blocks"), run: (): (Block & Judgment)[] => [] },
          {
            title: "Nothing to classify",
            description:
              "Empty input produces empty Markdown without any Jev calls.",
          },
        ),
    },
    { title: "Are there recovered blocks?" },
  );
  const result = flow.task(
    "render-markdown",
    {
      input: {
        blocks: classified,
        merged,
        prepared,
        original: flow.input.get("message"),
      },
      run: ({ blocks, merged, prepared, original }): StructureResult => ({
        original,
        lines: prepared.lines,
        joins: merged.joins,
        blocks,
        ...renderBlocks(blocks),
        stitchQuestions: prepared.stitchQuestions,
        classifyQuestions: Object.keys(classifyRequest(blocks).questions)
          .length,
      }),
    },
    {
      title: "Render Markdown in code",
      description:
        "Group adjacent list/code blocks. A list is numbered when its mean step probability is ≥50%. Use returned Choice labels, not confidence thresholds.",
    },
  );
  return flow.output("recovered-document", result, {
    title: "Recovered document",
    description:
      "Input wording with normalized whitespace and added Markdown structure. Synthetic responses; no text-generation model.",
  });
});
