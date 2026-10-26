import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { FlowRun } from "jev-devtools/flow";
import {
  entityCases,
  type EntityCase,
} from "../../../cookbooks/entity-alignment/cases.js";
import {
  entityFlow,
  alignmentRequest,
  preparePair,
  type EntityResult,
} from "../../../cookbooks/entity-alignment/flow.js";
import { entitySampleTransport } from "../../../cookbooks/entity-alignment/samples.js";
async function sampleRun(caseId: EntityCase) {
  const requests: ReturnType<typeof alignmentRequest>[] = [];
  const sample = entitySampleTransport(caseId, 0);
  let capture: FlowRun | undefined;
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
  const result = await entityFlow.run(
    { caseId, message: entityCases[caseId].message },
    {
      client,
      devtools: {
        startFlow: () => ({
          update: (run) => {
            capture = run;
          },
          request: (_label, _tags, run) => run(),
        }),
      },
    },
  );
  return {
    result,
    value: result.value as EntityResult,
    requests,
    capture: capture!,
  };
}
// New cookbook contract: actual public flow execution must route on the Score,
// preserve all four source questions and exclude reference labels. Existing
// cookbook tests exercise different algorithms and cannot detect these mistakes.
test("one pair becomes one four-question request, with source levels, raw records and no benchmark-label leakage", async () => {
  const { requests, value, capture } = await sampleRun("same");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, "jev-1.12");
  assert.deepEqual(Object.keys(requests[0].state), ["entity_a", "entity_b"]);
  assert.deepEqual(requests[0].questions, {
    link_state: {
      type: "score",
      instructions: "How do the two entity descriptions relate as products?",
      criteria: [
        "They describe two different products.",
        "They describe closely related products that may or may not be the same one: a variant, a special edition, or a name that could plausibly refer to either.",
        "They describe one and the same product.",
      ],
    },
    same_name: {
      type: "noul",
      instructions: "Do the two entities state the same beer name?",
    },
    same_brewery: {
      type: "noul",
      instructions: "Are the two entities from the same brewery?",
    },
    same_style: {
      type: "noul",
      instructions: "Do the two entities describe the same beer style?",
    },
  });
  assert.equal(requests[0].state.entity_a.abv, "10.00 %");
  assert.equal(requests[0].state.entity_b.abv, "10 %");
  assert.equal(value.abvGap, 0);
  assert.equal(value.confidence, 0.37);
  assert.equal(value.score, 1.8);
  assert.equal(value.level, 2);
  assert.notEqual(
    value.confidence,
    Math.max(...Object.values(value.probabilities)),
  );
  assert.deepEqual(
    Object.keys(capture.steps).filter(
      (id) => capture.steps[id].status === "completed",
    ),
    [
      "prepare-pair",
      "assess-pair",
      "prepare-evidence",
      "below-lower-boundary",
      "below-upper-boundary",
      "proposed-same-as",
    ],
  );
});
test("Score routing includes both sides and equality at 0.5 and 1.5; opposing Nouls and confidence never override it", async () => {
  const cases = [
    ["different", 0.2, "leave-unlinked", 0],
    ["style", 1.2, "curator-review", 1],
    ["variant", 1.1, "curator-review", 1],
    ["belowLower", 0.499, "leave-unlinked", 0],
    ["atLower", 0.5, "curator-review", 1],
    ["aboveLower", 0.501, "curator-review", 1],
    ["belowUpper", 1.499, "curator-review", 1],
    ["atUpper", 1.5, "proposed-same-as", 2],
    ["aboveUpper", 1.501, "proposed-same-as", 2],
  ] as const;
  for (const [caseId, score, outcome, level] of cases) {
    const { value, result, requests, capture } = await sampleRun(caseId);
    assert.equal(requests.length, 1);
    assert.equal(result.outcome, outcome, caseId);
    assert.equal(value.score, score);
    assert.equal(value.level, level);
    assert.equal(value.level, Math.min(Math.trunc(value.score + 0.5), 2));
    assert.equal(capture.steps[outcome].status, "completed");
    assert.equal(
      capture.steps["below-upper-boundary"].status,
      score < 0.5 ? "untaken" : "completed",
    );
    if (caseId === "different") assert.equal(value.abvGap, 3.4);
    if (caseId === "belowLower")
      assert.deepEqual(Object.values(value.properties), [1, 1, 1]);
    if (caseId === "atUpper")
      assert.deepEqual(Object.values(value.properties), [0, 0, 0]);
  }
});
test("server preparation rejects unknown or changed samples before dispatch; fixture transport rejects altered state, model or questions", async () => {
  let count = 0;
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    fetch: async () => {
      count++;
      throw new Error("Unexpected request");
    },
  });
  for (const input of [
    { caseId: "same" as EntityCase, message: "edited" },
    { caseId: "unknown" as EntityCase, message: entityCases.same.message },
  ])
    await assert.rejects(
      entityFlow.run(input, { client }),
      /No entity-alignment sample/,
    );
  assert.equal(count, 0);
  const sample = entitySampleTransport("same", 0);
  const request = alignmentRequest(
    preparePair({ caseId: "same", message: entityCases.same.message }),
  );
  for (const change of [
    { state: {} },
    { questions: {} },
    { model: "different-model" },
  ])
    await assert.rejects(
      sample("https://sample.invalid", {
        body: JSON.stringify({ ...request, ...change }),
      }),
      /does not match/,
    );
});
test("cancelling the one pending request prevents evidence preparation and terminal output", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  let capture: FlowRun | undefined;
  const sample = entitySampleTransport("same", 10000);
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: (url, init) => {
      started();
      return sample(url, init);
    },
  });
  const run = entityFlow.run(
    { caseId: "same", message: entityCases.same.message },
    {
      client,
      signal: controller.signal,
      devtools: {
        startFlow: () => ({
          update: (r) => {
            capture = r;
          },
          request: (_l, _t, cb) => cb(),
        }),
      },
    },
  );
  const rejected = assert.rejects(run);
  await pending;
  controller.abort();
  await rejected;
  assert.equal(capture!.status, "cancelled");
  assert.equal(capture!.steps["prepare-evidence"].status, "cancelled");
});
