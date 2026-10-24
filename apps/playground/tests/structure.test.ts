import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  structureCases,
  type StructureCase,
} from "../../../cookbooks/structure-recovery/cases.js";
import {
  structureFlow,
  toLines,
  classifyRequest,
  stitchRequest,
  type StructureResult,
} from "../../../cookbooks/structure-recovery/flow.js";
import { structureSampleTransport } from "../../../cookbooks/structure-recovery/samples.js";
function sampleRun(caseId: StructureCase) {
  const requests: any[] = [];
  const sample = structureSampleTransport(caseId, 0);
  const client = new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return sample(url, init);
    },
  });
  return {
    requests,
    result: structureFlow.run(
      { caseId, message: structureCases[caseId].message },
      { client },
    ),
  };
}
test("structure recovery batches two sequential passes, classifies the merged text and renders relevant companions without rewriting content", async () => {
  const { requests, result } = sampleRun("memo");
  const value = (await result).value as StructureResult;
  assert.equal(requests.length, 2);
  assert.deepEqual(Object.keys(requests[0].questions), [
    "L002",
    "L005",
    "L007",
    "L009",
    "L011",
  ]);
  assert.equal(requests[0].model, "jev-1.12");
  assert.equal(
    requests[0].questions.L002.instructions,
    "Does line L002 pick up mid-sentence, continuing a sentence left unfinished at the end of line L001?",
  );
  assert.equal(
    requests[0].questions.L002.criteria.false,
    "The line begins a new sentence, item, heading, or thought of its own",
  );
  assert.ok(
    requests[1].state.includes(
      "B001| The new build pipeline is ready for the team to try.",
    ),
  );
  assert.ok(!requests[1].state.includes("L002|"));
  assert.equal(Object.keys(requests[1].questions).length, 36);
  assert.equal(
    requests[1].questions.type_B001.instructions,
    "What kind of content is block B001?",
  );
  assert.deepEqual(Object.keys(requests[1].questions.type_B001.criteria), [
    "heading",
    "paragraph",
    "list_item",
    "quote",
    "code",
    "callout",
  ]);
  assert.equal(
    requests[1].questions.step_B003.criteria.true,
    "It is one step of a procedure - the items around it must happen in order",
  );
  assert.equal(
    value.markdown,
    `# Release checklist

The new build pipeline is ready for the team to try.

## Before Monday

1. Install the toolchain
2. Run the doctor script

\`\`\`
bun run build
bun run test
\`\`\`

> [!WARNING]
> If the doctor reports a failure, stop and ask the platform team for help.

> As Dana said, "a quiet migration is a successful migration."
`,
  );
  assert.equal(value.blocks[1].confidence, 0.42); // low confidence is displayed, not a routing gate
  assert.equal(value.blocks[1].step, 0.99); // irrelevant companion cannot turn prose into a list
  assert.deepEqual(value.blocks[1].lines, [1, 2]);
  assert.equal(value.groups.find((g) => g.kind === "list_item")!.meanStep, 0.5);
  assert.equal(value.groups.find((g) => g.kind === "list_item")!.ordered, true); // group threshold, not per item
});
test("join thresholds are inclusive and depend on prior punctuation; blank-separated and empty documents bypass unnecessary inference", async () => {
  const boundary = (await sampleRun("boundaries").result)
    .value as StructureResult;
  assert.deepEqual(
    boundary.blocks.map((b) => b.lines),
    [[0, 1], [2, 3], [4], [5]],
  );
  assert.deepEqual(
    boundary.joins.slice(1).map((j) => [j.probability, j.threshold, j.merged]),
    [
      [0.2, 0.2, true],
      [0.499, 0.5, false],
      [0.5, 0.5, true],
      [0.01, 0.5, false],
      [0.199, 0.2, false],
    ],
  );
  for (const caseId of ["separated", "empty"] as const) {
    const { requests, result } = sampleRun(caseId);
    const data = (await result).value as StructureResult;
    assert.equal(requests.length, caseId === "empty" ? 0 : 1);
    assert.equal(data.stitchQuestions, 0);
    assert.equal(
      data.markdown,
      caseId === "empty" ? "" : "# A title\n\nA standalone paragraph.\n",
    );
    if (caseId === "separated") {
      assert.equal(data.joins[1].probability, null);
      assert.equal(data.joins[1].merged, false);
      assert.ok(requests[0].questions.type_B001);
    }
  }
});
test("request preparation preserves blank-line evidence and only asks heading levels up to ninety Unicode characters", () => {
  const lines = toLines("\n\t Heading  \n\n a\t wrapped  \n line.\n");
  assert.deepEqual(lines, [
    { text: "Heading", gap: false },
    { text: "a wrapped", gap: true },
    { text: "line.", gap: false },
  ]);
  const stitch = stitchRequest(lines);
  assert.equal(stitch.state, "L000| Heading\n\nL001| a wrapped\nL002| line.");
  assert.deepEqual(Object.keys(stitch.questions), ["L002"]);
  const request = classifyRequest([
    { text: "😀".repeat(90), gap: false },
    { text: "x".repeat(91), gap: true },
  ]);
  assert.ok(request.questions.hlevel_B000);
  assert.ok(!request.questions.hlevel_B001);
  assert.ok(
    request.questions.type_B001 &&
      request.questions.step_B001 &&
      request.questions.callout_B001,
  );
});
test("samples reject mismatched documents and question sets; cancellation during stitching prevents classification", async () => {
  const sample = structureSampleTransport("memo", 0);
  const request = stitchRequest(toLines(structureCases.memo.message));
  await assert.rejects(
    sample("https://sample.invalid", {
      body: JSON.stringify({ ...request, state: "changed" }),
    }),
    /does not match/,
  );
  await assert.rejects(
    sample("https://sample.invalid", {
      body: JSON.stringify({ ...request, questions: {} }),
    }),
    /does not match/,
  );
  const controller = new AbortController();
  let started!: () => void;
  const firstRequest = new Promise<void>((resolve) => {
    started = resolve;
  });
  let count = 0;
  const slow = structureSampleTransport("memo", 10000);
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: (url, init) => {
      count++;
      started();
      return slow(url, init);
    },
  });
  const running = structureFlow.run(
    { caseId: "memo", message: structureCases.memo.message },
    { client, signal: controller.signal },
  );
  const rejected = assert.rejects(running);
  await firstRequest;
  controller.abort();
  await rejected;
  assert.equal(count, 1);
});
