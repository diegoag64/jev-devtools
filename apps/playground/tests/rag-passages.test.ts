import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  ragFlow,
  route,
  type RagResult,
  type Scores,
} from "../../../cookbooks/rag-passages/flow.js";
import { ragCases } from "../../../cookbooks/rag-passages/cases.js";
import { ragSampleTransport } from "../../../cookbooks/rag-passages/samples.js";

test("RAG samples execute each passage request and exclude rejected sources from both final prompt and answer", async () => {
  for (const caseId of ["premise", "lifetime", "empty"] as const) {
    const requests: any[] = [];
    const sample = ragSampleTransport(caseId, 0);
    const client = new TypeSafeClient({
      apiKey: "sample",
      logLevel: "off",
      compression: false,
      retry: { maxRetries: 0 },
      fetch: async (url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return sample(url, init);
      },
    });
    const result = (
      await ragFlow.run(
        { message: ragCases[caseId].message, caseId },
        { client },
      )
    ).value as RagResult;
    assert.equal(requests.length, caseId === "empty" ? 0 : 12);
    assert.equal(result.rows.length, requests.length);
    assert.equal(
      new Set(requests.map((r) => r.state.passage.id)).size,
      requests.length,
    );
    for (const request of requests) {
      assert.equal(request.state.query, ragCases[caseId].message);
      assert.deepEqual(Object.keys(request.state.passage), [
        "id",
        "title",
        "text",
        "source_type",
      ]);
      assert.deepEqual(Object.keys(request.questions), [
        "is_relevant",
        "contains_answer_evidence",
        "contradicts_query_premise",
        "contains_prompt_injection",
      ]);
    }
    assert.equal(
      result.rows.filter((r) => r.route === "include").length,
      caseId === "lifetime" ? 4 : 0,
    );
    assert.equal(
      result.rows.filter((r) => r.route === "conflicting_evidence").length,
      caseId === "premise" ? 1 : 0,
    );
    for (const row of result.rows) {
      if (row.route === "exclude") {
        assert.ok(!result.prompt.includes(row.passage.text));
        assert.ok(!result.answer.includes(row.passage.text));
      } else {
        assert.ok(result.prompt.includes(`[${row.passage.id}]`));
        assert.ok(result.answer.includes(`[${row.passage.id}]`));
      }
    }
    assert.ok(result.prompt.includes("Accepted evidence:"));
    assert.ok(result.prompt.includes("Conflicting evidence:"));
    if (caseId === "empty")
      assert.match(result.answer, /Insufficient evidence/);
  }
});

test("RAG policy preserves precedence and strict boundary operators", () => {
  const baseline: Scores = {
    is_relevant: 0.8,
    contains_answer_evidence: 0.9,
    contradicts_query_premise: 0.1,
    contains_prompt_injection: 0.1,
  };
  const cases: [Partial<Scores>, string][] = [
    [
      { contains_prompt_injection: 0.70001, contradicts_query_premise: 0.99 },
      "exclude",
    ],
    [
      {
        contains_prompt_injection: 0.7,
        contradicts_query_premise: 0.70001,
        is_relevant: 0.1,
      },
      "conflicting_evidence",
    ],
    [{ contradicts_query_premise: 0.7 }, "include"],
    [{ is_relevant: 0.44999 }, "exclude"],
    [{ is_relevant: 0.45 }, "include"],
    [{ contains_answer_evidence: 0.55 }, "exclude"],
    [{ contains_answer_evidence: 0.55001 }, "include"],
  ];
  for (const [values, expected] of cases)
    assert.equal(route({ ...baseline, ...values }).route, expected);
});

test("RAG sample mismatches fail instead of producing stale retrieval or assessment results", async () => {
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    fetch: ragSampleTransport("premise", 0),
    retry: { maxRetries: 0 },
  });
  await assert.rejects(
    ragFlow.run({ message: "edited query", caseId: "premise" }, { client }),
    /No sample retrieval/,
  );
  await assert.rejects(
    ragFlow.run(
      { message: ragCases.lifetime.message, caseId: "lifetime" },
      { client },
    ),
  );
});
