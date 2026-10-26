import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  parallelQuestionsCases,
  type ParallelQuestionsCase,
} from "../../../cookbooks/parallel-questions/cases.js";
import {
  parallelQuestionsFlow,
  questionKeys,
  questionSpecs,
  questionRequest,
  readMetrics,
  summarize,
  type ParallelQuestionsResult,
} from "../../../cookbooks/parallel-questions/flow.js";
import { parallelQuestionsSampleTransport } from "../../../cookbooks/parallel-questions/samples.js";
const expectedKeys = [
  "breach_72h",
  "applies_non_eu",
  "dpo_all_orgs",
  "pre_ticked_consent",
  "right_erasure",
  "data_portability",
  "us_federal_law",
  "criminal_penalties",
  "instrument_type",
  "max_fine",
  "individual_rights",
  "penalty_severity",
  "compliance_burden",
];
function sampleRun(caseId: ParallelQuestionsCase) {
  const requests: ReturnType<typeof questionRequest>[] = [];
  const transport = parallelQuestionsSampleTransport(caseId, 1);
  let active = 0,
    maxActive = 0;
  const client = new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        return await transport(url, init);
      } finally {
        active--;
      }
    },
  });
  return {
    requests,
    maxActive: () => maxActive,
    result: parallelQuestionsFlow.run(
      { caseId, message: parallelQuestionsCases[caseId].message },
      { client },
    ),
  };
}
test("official question wording, order and criteria remain byte faithful after Python-to-JSON transcription", () => {
  assert.deepEqual(questionKeys, expectedKeys);
  // Canonical JSON fingerprint extracted independently from the reviewed official
  // page's Python QUESTIONS AST; provenance.json pins the page SHA-256.
  assert.equal(
    createHash("sha256").update(JSON.stringify(questionSpecs)).digest("hex"),
    "a5d5f55231fcf957690db46bf6bc3b1f42db947e3e3788089c6b436b6e76faec",
  );
  assert.deepEqual(
    Object.values(questionSpecs).map((q) => q.type),
    [...Array(8).fill("noul"), "choice", "choice", "score", "score", "score"],
  );
});
test("public flow executes five batches before five sequential sets of thirteen; all questions and the same document cross the SDK transport", async () => {
  const run = sampleRun("stable");
  const result = await run.result;
  assert.equal(result.outcome, "comparison");
  const data = result.value as ParallelQuestionsResult;
  assert.equal(run.requests.length, 70);
  assert.equal(run.maxActive(), 1);
  for (let i = 0; i < 70; i++) {
    const request = run.requests[i];
    assert.deepEqual(
      Object.keys(request.questions),
      i < 5 ? expectedKeys : [expectedKeys[(i - 5) % 13]],
    );
    assert.deepEqual(request.state, run.requests[0].state);
    assert.equal(request.model, "jev-1.12");
  }
  assert.equal(data.batchedRequests, 5);
  assert.equal(data.singleRequests, 65);
  assert.equal(data.repeats, 5);
  assert.deepEqual(
    data.rows.map((row) => row.key),
    expectedKeys,
  );
  for (const row of data.rows) {
    assert.equal(row.batched.length, 5);
    assert.equal(row.singles.length, 5);
    assert.ok(Math.abs(row.batchStats.stdev!) < 1e-14);
    assert.equal(row.meanDifference, 0);
  }
  assert.equal(data.rows[8].batchStats.mean, 0.85); // confidence is 0.42
  assert.equal(data.rows[10].batchStats.mean, 1); // 3/3
  assert.equal(data.rows[12].batchStats.mean, 0.75); // 3/4
});
test("five-repeat statistics use sample deviation and preserve zero/one Noul and Score endpoints", async () => {
  const data = (await sampleRun("varied").result)
    .value as ParallelQuestionsResult;
  assert.deepEqual(
    data.rows[0].batched.map((row) => row.value),
    [0, 0.25, 0.5, 0.75, 1],
  );
  assert.deepEqual(
    data.rows[0].singles.map((row) => row.value),
    [0.1, 0.3, 0.5, 0.7, 0.9],
  );
  assert.equal(data.rows[0].batchStats.mean, 0.5);
  assert.equal(data.rows[0].batchStats.stdev, Math.sqrt(0.15625));
  assert.ok(Math.abs(data.rows[0].singleStats.stdev! - Math.sqrt(0.1)) < 1e-14);
  assert.deepEqual(
    data.rows[12].batched.map((row) => row.value),
    [0, 0.25, 0.5, 0.75, 1],
  );
  assert.deepEqual(summarize([1]), { mean: 1, stdev: null });
  assert.throws(() => summarize([]), /At least one/);
  const metric = readMetrics({
    instrument_type: {
      type: "choice",
      choice: "Regulation",
      confidence: 0.02,
      probabilities: { Regulation: 0.2, Directive: 0.8 },
    },
  });
  assert.equal(metric[0].value, 0.8); // exact upstream max(), not selected-label probability
});
test("sample transport rejects changed document, model, questions and reordered single calls", async () => {
  const request = questionRequest(
    parallelQuestionsCases.stable.message,
    questionKeys,
  );
  for (const change of [
    { state: {} },
    { model: "other" },
    { questions: {} },
    {
      questions: {
        ...request.questions,
        breach_72h: { type: "noul", instructions: "changed" },
      },
    },
  ]) {
    await assert.rejects(
      parallelQuestionsSampleTransport("stable", 0)("https://sample.invalid", {
        body: JSON.stringify({ ...request, ...change }),
      }),
      /does not match/,
    );
  }
  const transport = parallelQuestionsSampleTransport("stable", 0);
  for (let i = 0; i < 5; i++)
    await transport("https://sample.invalid", {
      body: JSON.stringify(request),
    });
  await assert.rejects(
    transport("https://sample.invalid", {
      body: JSON.stringify(
        questionRequest(parallelQuestionsCases.stable.message, [
          questionKeys[1],
        ]),
      ),
    }),
    /request order/,
  );
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    fetch: () => {
      throw new Error("Must never dispatch");
    },
  });
  await assert.rejects(
    parallelQuestionsFlow.run(
      { caseId: "stable", message: "edited" },
      { client },
    ),
    /No parallel questions sample/,
  );
});
test("cancellation during a single-question map stops queued items and later repeats", async () => {
  const controller = new AbortController();
  let count = 0;
  const transport = parallelQuestionsSampleTransport("stable", 0);
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      count++;
      if (count === 6) controller.abort();
      return transport(url, init);
    },
  });
  await assert.rejects(
    parallelQuestionsFlow.run(
      { caseId: "stable", message: parallelQuestionsCases.stable.message },
      { client, signal: controller.signal },
    ),
  );
  assert.equal(count, 6);
});
