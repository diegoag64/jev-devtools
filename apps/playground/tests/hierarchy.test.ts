import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { hierarchyCases } from "../../../cookbooks/hierarchical-classification/cases.js";
import {
  hierarchyFlow,
  hierarchyLimitFlow,
  childRequest,
  type HierarchyResult,
} from "../../../cookbooks/hierarchical-classification/flow.js";
import { hierarchySampleTransport } from "../../../cookbooks/hierarchical-classification/samples.js";
import type { FlowRun } from "jev-devtools/flow";

test("hierarchy sample preserves independent frontier requests and beam scoring, retaining an alternative that greedy discards", async () => {
  const requests: any[] = [];
  const sample = hierarchySampleTransport("recovery", 0);
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
  const value = (
    await hierarchyFlow.run(
      { caseId: "recovery", message: hierarchyCases.recovery.message },
      { client },
    )
  ).value as HierarchyResult;
  assert.equal(requests.length, 5); // beam: root + Audio + Cameras; greedy: root + Audio
  assert.ok(requests.every((r) => Object.keys(r.questions).join() === "child"));
  assert.ok(requests.every((r) => r.state === hierarchyCases.recovery.message));
  assert.deepEqual(
    requests[0].questions.child.instructions,
    "Which direct child category best matches this document?",
  );
  assert.deepEqual(value.beam.beam[0].path, [
    "Cameras",
    "Mirrorless",
    "Interchangeable lens",
  ]);
  assert.deepEqual(value.greedy.beam[0].path, ["Audio", "Speakers"]);
  assert.ok(
    Math.abs(value.beam.beam[0].score - Math.sqrt(0.35 * 0.95)) < 1e-12,
  );
  assert.ok(
    Math.abs(value.greedy.beam[0].score - Math.sqrt(0.55 * 0.34)) < 1e-12,
  );
  assert.equal(value.beam.beam[0].decisions, 2); // single-child edge adds no decision
  assert.equal(value.beam.rounds.length, 3);
  assert.equal(value.greedy.rounds.length, 2);
  assert.deepEqual(
    value.beam.rounds[1].kept.map((c) => c.path),
    [
      ["Cameras", "Mirrorless"],
      ["Audio", "Speakers"],
      ["Audio", "Headphones"],
    ],
  );
  assert.ok(
    value.beam.rounds[1].pruned.some(
      (c) => c.path.join("/") === "Accessories/Camera straps",
    ),
  );
  assert.equal(value.agrees, false);
});
test("single-child paths and a preselected leaf make no requests, but record the correct iteration history", async () => {
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      throw new Error("No inference expected");
    },
  });
  for (const caseId of ["single", "leaf"] as const) {
    const value = (
      await hierarchyFlow.run(
        { caseId, message: hierarchyCases[caseId].message },
        { client },
      )
    ).value as HierarchyResult;
    assert.equal(value.beam.rounds.length, caseId === "single" ? 2 : 0);
    assert.equal(value.greedy.rounds.length, value.beam.rounds.length);
    assert.equal(value.beam.beam[0].decisions, 0);
    assert.equal(value.beam.beam[0].score, 1);
    assert.deepEqual(
      value.beam.beam[0].path,
      caseId === "single" ? ["Catalog", "Archive"] : ["Audio", "Speakers"],
    );
    assert.equal(value.agrees, true);
  }
});
test("depth exhaustion is visibly incomplete and mismatched sample requests never receive unrelated scores", async () => {
  let run: FlowRun | undefined;
  const sample = hierarchySampleTransport("limit", 0);
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: sample,
  });
  await assert.rejects(
    hierarchyLimitFlow.run(
      { caseId: "limit", message: hierarchyCases.limit.message },
      {
        client,
        devtools: {
          startFlow: () => ({
            update: (r) => {
              run = r;
            },
            request: (_l, _t, cb) => cb(),
          }),
        },
      },
    ),
    { name: "FlowLoopLimitError" },
  );
  assert.equal(run!.status, "error");
  assert.equal(run!.steps["compare-results"].status, "blocked");
  assert.ok(
    ["beam-search", "greedy-search"].some(
      (id) => run!.steps[id].loop?.stopReason === "limit",
    ),
  );
  for (const request of [
    childRequest("changed", ["Audio", "Cameras", "Accessories"]),
    childRequest(hierarchyCases.limit.message, ["Invented", "Options"]),
  ]) {
    await assert.rejects(
      sample("https://sample.invalid", { body: JSON.stringify(request) }),
      /does not match/,
    );
  }
});
