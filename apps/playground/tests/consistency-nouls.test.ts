import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  replayClient,
  type FlowFixture,
  type FlowRun,
} from "jev-devtools/flow";
import {
  createNoulFlow,
  claim,
  questionTexts,
  rubricRequest,
  type NoulResult,
} from "../../../cookbooks/consistency-nouls/flow.js";
import { createNoulSample } from "../../../cookbooks/consistency-nouls/samples.js";
import {
  noulCases,
  type NoulCase,
} from "../../../cookbooks/consistency-nouls/cases.js";
function sampleRun(caseId: NoulCase) {
  const requests: any[] = [];
  const sample = createNoulSample(caseId, 0);
  let active = 0,
    peak = 0;
  let snapshot!: FlowRun;
  const client = new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      active++;
      peak = Math.max(peak, active);
      requests.push(JSON.parse(String(init?.body)));
      try {
        return await sample.fetch(url, init);
      } finally {
        active--;
      }
    },
  });
  const flow = createNoulFlow(sample.returnedModels);
  return {
    requests,
    peak: () => peak,
    snapshot: () => snapshot,
    result: flow.run(
      { caseId, message: noulCases[caseId].message },
      {
        client,
        devtools: {
          startFlow: () => ({
            update: (run) => {
              snapshot = run;
            },
            request: (_l, _t, cb) => cb(),
          }),
        },
      },
    ),
  };
}
test("official claim/rubric and fifteen sequential SDK calls retain all probabilities, model labels and computed statistics", async () => {
  const run = sampleRun("variation");
  const value = (await run.result).value as NoulResult;
  assert.equal(run.requests.length, 15);
  assert.equal(run.peak(), 1);
  assert.equal(Object.keys(questionTexts).length, 14);
  assert.deepEqual(Object.keys(questionTexts), [
    "covered",
    "exclusion",
    "on_circuit",
    "deductible",
    "docs_sufficient",
    "within_limit",
    "within_window",
    "reported_timely",
    "rental_eligible",
    "fraud_flag",
    "human_review",
    "manual_review",
    "line_items_sum",
    "subrogation",
  ]);
  // Pinned values protect source fidelity independently of the transport's matcher.
  for (const [file, expected] of [
    [
      "claim.json",
      "47299b36b73775295a7cb53bb5024c184547f24cbbdb67805bc0328d13a2be23",
    ],
    [
      "questions.json",
      "61d0cf0df3027d1ecb7184ad8d4615fad316b25ceb7a315e455f0a23a9493591",
    ],
  ])
    assert.equal(
      createHash("sha256")
        .update(
          JSON.stringify(
            JSON.parse(
              readFileSync(
                new URL(
                  `../../../cookbooks/consistency-nouls/${file}`,
                  import.meta.url,
                ),
                "utf8",
              ),
            ),
          ),
        )
        .digest("hex"),
      expected,
    );
  for (let i = 0; i < 15; i++) {
    const request = run.requests[i],
      repeat = value.repeats[i];
    assert.deepEqual(request.state, { uid: `${i}:synthetic-variation`, claim });
    assert.equal(request.model, "jev-latest");
    assert.deepEqual(
      Object.keys(request.questions),
      Object.keys(questionTexts),
    );
    for (const [key, text] of Object.entries(questionTexts)) {
      assert.equal(request.questions[key].type, "noul");
      assert.equal(request.questions[key].instructions, text);
    }
    assert.equal(repeat.index, i);
    assert.equal(repeat.answers.length, 14);
    assert.equal(repeat.requestedModel, "jev-latest");
    assert.equal(
      repeat.returnedModel,
      i < 10 ? "synthetic-noul-a" : "synthetic-noul-b",
    );
  }
  assert.deepEqual(
    value.repeats.map((r) => r.answers[0].probability),
    [
      0.47, 0.49, 0.5, 0.48, 0.51, 0.49, 0.48, 0.5, 0.49, 0.47, 0.51, 0.5, 0.48,
      0.49, 0.51,
    ],
  );
  const covered = value.questions[0];
  assert.ok(Math.abs(covered.mean - 0.49133333333333334) < 1e-12);
  assert.ok(Math.abs(covered.populationStdDev - 0.013097921802925678) < 1e-12);
  assert.equal(covered.min, 0.47);
  assert.equal(covered.max, 0.51);
  assert.deepEqual(covered.counts, { no: 0, uncertain: 15, yes: 0 });
  assert.equal(
    value.repeats[0].answers.find((a) => a.key === "manual_review")!.decision,
    "uncertain",
  );
  assert.equal(
    value.repeats[1].answers.find((a) => a.key === "manual_review")!.decision,
    "yes",
  );
  assert.equal(run.snapshot().steps["describe-fixtures"].status, "completed");
});
test("all threshold neighbors and inclusive edges run through the public flow and select the actual review path", async () => {
  const run = sampleRun("boundaries");
  const value = (await run.result).value as NoulResult;
  const expected = [
    "no",
    "no",
    "uncertain",
    "uncertain",
    "uncertain",
    "uncertain",
    "uncertain",
    "yes",
    "yes",
    "uncertain",
    "uncertain",
    "no",
    "yes",
    "uncertain",
    "uncertain",
  ];
  assert.deepEqual(
    value.repeats.map((r) => r.answers[0].decision),
    expected,
  );
  for (let i = 0; i < 15; i++) {
    const repeat = value.repeats[i];
    assert.ok(
      repeat.answers.every((answer) => answer.decision === expected[i]),
    );
    const uncertain = expected[i] === "uncertain";
    assert.equal(repeat.review.length, uncertain ? 14 : 0);
    assert.equal(
      run.snapshot().steps["repeat-rubric"].collection!.items[i].run!.steps[
        "needs-review"
      ].decision,
      uncertain,
    );
    assert.equal(
      run.snapshot().steps["repeat-rubric"].collection!.items[i].run!.steps[
        uncertain ? "review-queue" : "no-review"
      ].status,
      "completed",
    );
    assert.equal(
      run.snapshot().steps["repeat-rubric"].collection!.items[i].run!.steps[
        uncertain ? "no-review" : "review-queue"
      ].status,
      "untaken",
    );
  }
  assert.deepEqual(value.questions[0].counts, { no: 3, uncertain: 9, yes: 3 });
});
test("identical fixtures produce zero population SD without being independent draws; runs reset metadata and sequence", async () => {
  for (let iteration = 0; iteration < 2; iteration++) {
    const value = (await sampleRun("stable").result).value as NoulResult;
    assert.equal(value.meanPopulationStdDev, 0);
    assert.ok(value.questions.every((q) => q.populationStdDev === 0));
    assert.ok(
      value.repeats.every(
        (r) => r.review.length === 0 && r.returnedModel === "synthetic-noul-a",
      ),
    );
  }
});
test("sample transport rejects changed claims, questions, model, UID and order; flow rejects unmatched sample input before dispatch", async () => {
  const expected = rubricRequest("0:synthetic-variation");
  for (const body of [
    { ...expected, model: "other" },
    { ...expected, state: { ...expected.state, uid: "1:synthetic-variation" } },
    { ...expected, state: { ...expected.state, claim: {} } },
    { ...expected, questions: {} },
    {
      ...expected,
      questions: {
        ...expected.questions,
        covered: { ...expected.questions.covered, instructions: "Changed" },
      },
    },
  ])
    await assert.rejects(
      createNoulSample("variation", 0).fetch("https://sample.invalid", {
        body: JSON.stringify(body),
      }),
      /does not match/,
    );
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      calls++;
      throw new Error("Unexpected dispatch");
    },
  });
  for (const input of [
    { caseId: "variation", message: "changed" },
    { caseId: "unknown", message: noulCases.variation.message },
  ])
    await assert.rejects(
      createNoulFlow().run(input as any, { client }),
      /No Noul sample/,
    );
  assert.equal(calls, 0);
});
test("public replay retains changed answer values and rejects invalid probabilities without fabricating missing response metadata", async () => {
  const flow = createNoulFlow();
  const fixture: FlowFixture = {
    version: 1,
    flow: flow.definition.name,
    steps: Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [
        `repeat-rubric/${i}/ask-rubric`,
        {
          model: "replayed-model",
          answers: Object.fromEntries(
            Object.keys(questionTexts).map((key) => [
              key,
              { type: "noul", noul: 0.7 },
            ]),
          ),
        },
      ]),
    ),
  };
  const result = await flow.run(
    { caseId: "variation", message: noulCases.variation.message },
    { client: replayClient(fixture) },
  );
  const value = result.value as NoulResult;
  assert.ok(
    value.repeats.every(
      (r) => r.returnedModel === null && r.review.length === 14,
    ),
  );
  assert.equal(value.questions[0].min, 0.7);
  for (const invalid of [-0.01, 1.01]) {
    const changed = structuredClone(fixture);
    changed.steps["repeat-rubric/0/ask-rubric"] = {
      model: "replayed-model",
      answers: Object.fromEntries(
        Object.keys(questionTexts).map((key) => [
          key,
          { type: "noul", noul: key === "covered" ? invalid : 0.7 },
        ]),
      ),
    };
    await assert.rejects(
      flow.run(
        { caseId: "variation", message: noulCases.variation.message },
        { client: replayClient(changed) },
      ),
      /Invalid Noul probability/,
    );
  }
});
test("cancellation settles the transport and prevents queued repeats, routing and statistics", async () => {
  const sample = createNoulSample("variation", 10_000);
  const controller = new AbortController();
  let started!: () => void, settled!: () => void;
  const startedPromise = new Promise<void>((r) => {
    started = r;
  });
  const settledPromise = new Promise<void>((r) => {
    settled = r;
  });
  let count = 0,
    snapshot!: FlowRun;
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      count++;
      started();
      try {
        return await sample.fetch(url, init);
      } finally {
        settled();
      }
    },
  });
  const running = createNoulFlow(sample.returnedModels).run(
    { caseId: "variation", message: noulCases.variation.message },
    {
      client,
      signal: controller.signal,
      devtools: {
        startFlow: () => ({
          update: (run) => {
            snapshot = run;
          },
          request: (_l, _t, cb) => cb(),
        }),
      },
    },
  );
  const rejected = assert.rejects(running);
  await startedPromise;
  controller.abort();
  await rejected;
  await settledPromise;
  assert.equal(count, 1);
  assert.equal(sample.returnedModels.size, 0);
  assert.notEqual(
    snapshot.steps["repeat-rubric"].collection!.items[0].run!.steps[
      "route-answers"
    ].status,
    "completed",
  );
  assert.notEqual(snapshot.steps["describe-fixtures"].status, "completed");
});
