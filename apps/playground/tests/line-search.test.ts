import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { FlowRun } from "jev-devtools/flow";
import {
  lineSearchCases,
  type LineSearchCase,
} from "../../../cookbooks/line-search/cases.js";
import {
  lineId,
  lineSearchFlow,
  searchRequest,
  sourceLines,
  tagLines,
  type LineSearchResult,
} from "../../../cookbooks/line-search/flow.js";
import { lineSearchSampleTransport } from "../../../cookbooks/line-search/samples.js";

// Contract: the complete pinned source crosses tagging → request → ranking/lookup without loss.
// A truncated option set, wrong document index, or > rather than >= would break this port.
test("pinned document retains every source line and tags IDs within each document", () => {
  const bytes = readFileSync(
    new URL("../../../cookbooks/line-search/github-tos.txt", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "8bd60793d355b8fc280c3197d48e8222db600d60360f0d0b49a7c948ee0fea0d",
  );
  assert.equal(sourceLines.length, 218);
  assert.match(sourceLines[52], /^You own Your Content/);
  assert.deepEqual(tagLines(["one", "two"]), [
    { id: "L000", text: "one" },
    { id: "L001", text: "two" },
  ]);
  assert.equal(tagLines(Array(255).fill("text")).at(-1)!.id, "L254");
  assert.throws(() => tagLines(Array(256).fill("text")), /2–255/);
});

const expectedCases: [LineSearchCase, string, number, string][] = [
  ["ownership", "answered", 0.98, "L052"],
  ["termination", "answered", 0.97, "L168"],
  ["absent", "absent", 0.14, "L205"],
  ["partial", "partial", 0.46, "L029"],
  ["belowAbsent", "absent", 0.3499, "L205"],
  ["atAbsent", "partial", 0.35, "L205"],
  ["aboveAbsent", "partial", 0.3501, "L205"],
  ["belowFound", "partial", 0.6999, "L052"],
  ["atFound", "answered", 0.7, "L052"],
  ["aboveFound", "answered", 0.7001, "L052"],
];
for (const [caseId, outcome, exists, top] of expectedCases)
  test(`public flow: ${caseId} → ${outcome}; one request and complete lookup`, async () => {
    const requests: any[] = [];
    let captured: FlowRun | undefined;
    const sample = lineSearchSampleTransport(caseId, 0);
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
    const result = await lineSearchFlow.run(
      { caseId, message: lineSearchCases[caseId].message },
      {
        client,
        devtools: {
          startFlow: () => ({
            update: (run) => {
              captured = run;
            },
            request: (_l, _t, cb) => cb(),
          }),
        },
      },
    );
    const data = result.value as LineSearchResult;
    assert.equal(result.outcome, outcome);
    assert.equal(data.exists, exists);
    assert.equal(data.confidence, 0.41); // distinct from top probability; never used for routing
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.model, "jev-1.12");
    assert.equal(
      request.state,
      sourceLines.map((text, i) => `${lineId(i)}| ${text}`).join("\n"),
    );
    assert.deepEqual(Object.keys(request.questions), ["where", "exists"]);
    assert.deepEqual(
      Object.keys(request.questions.where.criteria),
      sourceLines.map((_, i) => lineId(i)),
    );
    assert.ok(
      Object.values(request.questions.where.criteria).every((v) => v === null),
    );
    assert.equal(request.questions.where.type, "choice");
    assert.equal(
      request.questions.where.instructions,
      `Which line of the document contains the answer to: "${data.query}"?`,
    );
    assert.deepEqual(request.questions.exists, {
      type: "noul",
      instructions: `Does any line of the document address or answer: "${data.query}"?`,
      criteria: {
        true: "At least one line of the document states or directly implies the answer",
        false: "No line of the document addresses this",
      },
    });
    assert.equal(data.ranked.length, 218);
    assert.equal(data.relevance.length, 218);
    assert.equal(data.ranked[0].id, top);
    assert.ok(data.ranked[0].probability >= 0.86);
    assert.ok(Math.abs(data.relevance.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    for (const line of data.ranked) {
      const index = Number(line.id.slice(1));
      assert.equal(line.text, sourceLines[index]);
      assert.equal(line.probability, data.relevance[index]);
    }
    const zeroIds = data.ranked
      .filter((line) => line.probability === 0)
      .map((line) => line.id);
    assert.deepEqual(zeroIds, [...zeroIds].sort());
    assert.equal(captured!.status, "success");
    assert.deepEqual(
      Object.entries(captured!.steps)
        .filter(([, s]) => s.status === "completed")
        .map(([id]) => id),
      [
        "tag-lines",
        "find",
        "rank-lines",
        "lookup-lines",
        "answer-exists",
        ...(outcome === "answered" ? [] : ["answer-absent"]),
        outcome,
      ],
    );
  });

test("changed sample queries fail before any request; fixtures reject changed model, source and criteria", async () => {
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      calls++;
      throw new Error("unexpected");
    },
  });
  for (const input of [
    { caseId: "ownership", message: "changed" },
    { caseId: "unknown", message: lineSearchCases.ownership.message },
  ]) {
    await assert.rejects(
      lineSearchFlow.run(input as { caseId: LineSearchCase; message: string }, {
        client,
      }),
    );
  }
  assert.equal(calls, 0);
  const transport = lineSearchSampleTransport("ownership", 0);
  const expected = searchRequest(
    lineSearchCases.ownership.message,
    tagLines(sourceLines),
  );
  for (const changed of [
    { ...expected, model: "other" },
    { ...expected, state: "edited" },
    { ...expected, questions: { where: expected.questions.where } },
  ]) {
    await assert.rejects(
      transport("https://sample.invalid", { body: JSON.stringify(changed) }),
      /does not match/,
    );
  }
});
