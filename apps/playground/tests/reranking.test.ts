import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { type Fetch, TypeSafeClient } from "@typesafe-ai/sdk";
import type { FlowRun } from "jev-devtools/flow";
import {
  rerankingCases,
  type RerankingCase,
} from "../../../cookbooks/reranking/cases.js";
import {
  rerankingFlow,
  rerank,
  retrieveSample,
  sourceQuestion,
  type RerankingResult,
} from "../../../cookbooks/reranking/flow.js";
import { rerankingSampleTransport } from "../../../cookbooks/reranking/samples.js";

// Independent transcription from the official executable recipe, not from the fixture builder.
const expectedQuestion = {
  is_cited_source: {
    type: "noul",
    instructions:
      "The query excerpt comes from a US federal court opinion and was written immediately around a citation to a precedent; the citation itself has been removed. Could the candidate passage be from that cited precedent — does it establish the specific legal proposition the query excerpt invokes at its citation point?",
    criteria: {
      true: "The candidate passage states or establishes the specific rule, standard, holding, or fact pattern that the query excerpt attributes to its removed citation.",
      false:
        "The candidate passage is merely on a similar topic or doctrine; it does not supply the specific proposition the query excerpt relies on.",
    },
  },
};
function client(fetch: Fetch) {
  return new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch,
  });
}

test("real flow preserves source prompt, 30 pair requests in retrieval order, bounded concurrency and stable sorting", async () => {
  for (const caseId of ["reordered", "ties"] as const) {
    const requests: any[] = [],
      completed: string[] = [];
    let active = 0,
      highWater = 0,
      capture: FlowRun | undefined;
    const sample = rerankingSampleTransport(caseId, 12);
    const result = await rerankingFlow.run(
      { caseId, message: rerankingCases[caseId].message },
      {
        client: client(async (url, init) => {
          const body = JSON.parse(String(init?.body));
          requests.push(body);
          highWater = Math.max(highWater, ++active);
          try {
            const response = await sample(url, init);
            completed.push(body.state.candidate_passage);
            return response;
          } finally {
            active--;
          }
        }),
        devtools: {
          startFlow: () => ({
            update: (run) => {
              capture = run;
            },
            request: (_l, _t, cb) => cb(),
          }),
        },
      },
    );
    const data = result.value as RerankingResult;
    const original = retrieveSample(caseId, rerankingCases[caseId].message);
    assert.equal(requests.length, 30);
    assert.equal(highWater, 12);
    assert.equal(active, 0);
    assert.equal(
      new Set(requests.map((r) => r.state.candidate_passage)).size,
      30,
    );
    assert.deepEqual(
      requests.map((r) => r.state.candidate_passage),
      original.map((r) => r.text),
    );
    assert.notDeepEqual(
      completed,
      original.map((r) => r.text),
    );
    for (const request of requests) {
      assert.equal(request.model, "jev-1.12");
      assert.deepEqual(request.questions, expectedQuestion);
      assert.deepEqual(Object.keys(request.state).sort(), [
        "candidate_passage",
        "query_excerpt",
      ]);
      assert.equal(request.state.query_excerpt, rerankingCases[caseId].message);
    }
    assert.deepEqual(
      data.before.map((r) => r.id),
      original.map((r) => r.id),
    );
    assert.deepEqual(
      data.after.map((r) => r.id).sort(),
      original.map((r) => r.id).sort(),
    );
    for (let i = 1; i < data.after.length; i++) {
      const prior = data.after[i - 1],
        current = data.after[i];
      assert.ok(prior.probability >= current.probability);
      if (prior.probability === current.probability)
        assert.ok(prior.retrievalRank < current.retrievalRank);
    }
    if (caseId === "ties") assert.deepEqual(data.after, data.before);
    else {
      assert.equal(data.after[0].id, "sample-05");
      assert.equal(data.after[0].probability, 1);
      assert.equal(data.after.at(-1)!.probability, 0);
      assert.notDeepEqual(data.after, data.before);
    }
    assert.equal(capture!.steps["sort-candidates"].status, "completed");
    assert.equal(
      capture!.steps["score-candidates"].collection!.items.length,
      30,
    );
  }
});

test("stable sorting keeps input order for exact ties, does not mutate input, and rejects invalid probabilities", () => {
  const candidates = retrieveSample(
    "reordered",
    rerankingCases.reordered.message,
  ).slice(0, 5);
  const rows = candidates.map((row, i) => ({
    ...row,
    probability: [0, 0.5, 0.50001, 0.5, 1][i],
  }));
  const saved = structuredClone(rows);
  assert.deepEqual(
    rerank(rows).map((row) => row.id),
    ["sample-05", "sample-03", "sample-02", "sample-04", "sample-01"],
  );
  assert.deepEqual(rows, saved);
  assert.deepEqual(rerank([]), []);
  for (const probability of [-0.00001, 1.00001, NaN, Infinity])
    assert.throws(
      () => rerank([{ ...rows[0], probability }]),
      /Noul probability/,
    );
});

test("cancellation aborts active work, never dispatches queued candidates, and blocks sorting", async () => {
  const controller = new AbortController();
  let calls = 0,
    settled = 0,
    capture: FlowRun | undefined;
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const sample = rerankingSampleTransport("reordered", 10_000);
  const run = rerankingFlow.run(
    { caseId: "reordered", message: rerankingCases.reordered.message },
    {
      signal: controller.signal,
      client: client(async (url, init) => {
        if (++calls === 12) ready();
        try {
          return await sample(url, init);
        } finally {
          settled++;
        }
      }),
      devtools: {
        startFlow: () => ({
          update: (value) => {
            capture = value;
          },
          request: (_l, _t, cb) => cb(),
        }),
      },
    },
  );
  const rejected = assert.rejects(run);
  await started;
  controller.abort();
  await rejected;
  assert.equal(calls, 12);
  assert.equal(settled, 12);
  assert.equal(capture!.status, "cancelled");
  assert.notEqual(capture!.steps["sort-candidates"].status, "completed");
  assert.ok(
    capture!.steps["score-candidates"]
      .collection!.items.slice(12)
      .every((item) => item.status === "cancelled"),
  );
});

test("sample input and request drift fail instead of silently returning fixture scores", async () => {
  assert.deepEqual(sourceQuestion, expectedQuestion);
  await assert.rejects(
    rerankingFlow.run(
      { caseId: "reordered", message: "edited" },
      { client: client(rerankingSampleTransport("reordered", 0)) },
    ),
    /No re-ranking sample/,
  );
  assert.throws(
    () =>
      retrieveSample(
        "unknown" as RerankingCase,
        rerankingCases.reordered.message,
      ),
    /No re-ranking sample/,
  );
  const request = {
    model: "jev-1.12",
    state: {
      query_excerpt: rerankingCases.reordered.message,
      candidate_passage: retrieveSample(
        "reordered",
        rerankingCases.reordered.message,
      )[0].text,
    },
    questions: expectedQuestion,
  };
  for (const changed of [
    { ...request, model: "other-model" },
    { ...request, questions: {} },
    {
      ...request,
      state: { ...request.state, candidate_passage: "edited passage" },
    },
    { ...request, state: { ...request.state, extra: "field" } },
  ])
    await assert.rejects(
      rerankingSampleTransport("reordered", 0)("https://sample.invalid", {
        body: JSON.stringify(changed),
      }),
    );
});

test("authored retrieval fixture matches its provenance hash", () => {
  const root = new URL("../../../cookbooks/reranking/", import.meta.url);
  const provenance = JSON.parse(
    readFileSync(new URL("provenance.json", root), "utf8"),
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(new URL("retrieval-fixture.json", root)))
      .digest("hex"),
    provenance.localFixture.sha256,
  );
});
