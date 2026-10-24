import { setTimeout as delay } from "node:timers/promises";
// Node 22.12 lacks zstd; the SDK sends uncompressed bodies on that runtime.
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { structureCases, type StructureCase } from "./cases.js";
import {
  toLines,
  stitchRequest,
  classifyRequest,
  type Kind,
  type Line,
} from "./flow.js";
// Expected pass-2 blocks are authored independently of mergeLines so a changed
// merge decision cannot silently receive a fixture for a different document.
const fixtures: Record<
  StructureCase,
  {
    joins: Record<string, number>;
    blocks: (Line & {
      kind: Kind;
      level?: string;
      step?: number;
      aside?: string;
    })[];
  }
> = {
  memo: {
    joins: { L002: 0.8, L005: 0.05, L007: 0.03, L009: 0.75, L011: 0.8 },
    blocks: [
      {
        text: "Release checklist",
        gap: false,
        kind: "heading",
        level: "title",
      },
      {
        text: "The new build pipeline is ready for the team to try.",
        gap: true,
        kind: "paragraph",
      },
      { text: "Before Monday", gap: true, kind: "heading", level: "section" },
      {
        text: "Install the toolchain",
        gap: true,
        kind: "list_item",
        step: 0.4,
      },
      {
        text: "Run the doctor script",
        gap: false,
        kind: "list_item",
        step: 0.6,
      },
      { text: "bun run build", gap: true, kind: "code" },
      { text: "bun run test", gap: false, kind: "code" },
      {
        text: "If the doctor reports a failure, stop and ask the platform team for help.",
        gap: true,
        kind: "callout",
        aside: "warning",
      },
      {
        text: 'As Dana said, "a quiet migration is a successful migration."',
        gap: true,
        kind: "quote",
      },
    ],
  },
  boundaries: {
    joins: { L001: 0.2, L002: 0.499, L003: 0.5, L004: 0.01, L005: 0.199 },
    blocks: [
      {
        text: "A dangling fragment continues here.",
        gap: false,
        kind: "paragraph",
      },
      {
        text: "A new sentence. continued after punctuation.",
        gap: false,
        kind: "paragraph",
      },
      { text: "Another unfinished", gap: false, kind: "paragraph" },
      { text: "separate thought", gap: false, kind: "paragraph" },
    ],
  },
  separated: {
    joins: {},
    blocks: [
      { text: "A title", gap: false, kind: "heading", level: "title" },
      { text: "A standalone paragraph.", gap: true, kind: "paragraph" },
    ],
  },
  empty: { joins: {}, blocks: [] },
};
function choiceAnswer(selected: string, keys: string[], confidence = 0.86) {
  return {
    type: "choice",
    choice: selected,
    confidence,
    probabilities: Object.fromEntries(
      keys.map((key) => [
        key,
        key === selected ? 0.8 : 0.2 / (keys.length - 1),
      ]),
    ),
  };
}
export function structureSampleTransport(
  caseId: StructureCase,
  delayMs = 500,
): Fetch {
  return async (_url, init) => {
    const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
    const encoding = new Headers(init?.headers).get("content-encoding");
    const body = JSON.parse(
      encoding === "zstd"
        ? zlib.zstdDecompressSync(bytes).toString()
        : encoding === "gzip"
          ? zlib.gunzipSync(bytes).toString()
          : new TextDecoder().decode(bytes),
    );
    const fixture = fixtures[caseId];
    const stitch = stitchRequest(toLines(structureCases[caseId].message));
    const classify = classifyRequest(fixture.blocks);
    const matches = (expected: typeof stitch | typeof classify) =>
      Object.keys(expected.questions).length > 0 &&
      body.model === expected.model &&
      body.state === expected.state &&
      isDeepStrictEqual(body.questions, expected.questions);
    const answers: Record<string, unknown> = {};
    if (matches(stitch)) {
      for (const key of Object.keys(stitch.questions))
        answers[key] = { type: "noul", noul: fixture.joins[key] };
    } else if (matches(classify)) {
      fixture.blocks.forEach((block, i) => {
        const bid = `B${String(i).padStart(3, "0")}`;
        // The low-confidence paragraph still renders as the returned type.
        answers[`type_${bid}`] = choiceAnswer(
          block.kind,
          Object.keys(
            (
              classify.questions[`type_${bid}`] as ReturnType<
                typeof import("@typesafe-ai/sdk").choice
              >
            ).criteria,
          ),
          caseId === "memo" && i === 1 ? 0.42 : 0.86,
        );
        if (classify.questions[`hlevel_${bid}`])
          answers[`hlevel_${bid}`] = choiceAnswer(block.level ?? "subsection", [
            "title",
            "section",
            "subsection",
          ]);
        answers[`step_${bid}`] = { type: "noul", noul: block.step ?? 0.99 };
        answers[`callout_${bid}`] = choiceAnswer(block.aside ?? "tip", [
          "note",
          "tip",
          "warning",
        ]);
      });
    } else
      throw new Error(
        "Structure sample does not match the document and question set",
      );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({ model: "synthetic-structure-sample", answers });
  };
}
