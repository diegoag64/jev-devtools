import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  createSdeFlow,
  verifyRequest,
  evaluateFlags,
  type SdeResult,
} from "../../../cookbooks/sde-cascade/flow.js";
import { sdeCases } from "../../../cookbooks/sde-cascade/cases.js";
import { sdeSampleTransport } from "../../../cookbooks/sde-cascade/samples.js";
import type { FlowRun } from "jev-devtools/flow";

test("SDE samples execute one verification, choose the expected extractor and rejoin at the final comparison", async () => {
  const flow = createSdeFlow(0);
  for (const [caseId, route, changes, questions] of [
    ["fabricated", "strong", 1, 9],
    ["supported", "cheap", 0, 15],
    ["boundary", "cheap", 0, 15],
    ["missing", "strong", 1, 9],
  ] as const) {
    const requests: any[] = [];
    const sample = sdeSampleTransport(caseId, 0);
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
    let captured: FlowRun | undefined;
    const result = await flow.run(
      { caseId, message: sdeCases[caseId].message },
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
    const value = result.value as SdeResult;
    assert.equal(requests.length, 1);
    assert.equal(Object.keys(requests[0].questions).length, questions);
    assert.equal(requests[0].state.source_text, sdeCases[caseId].message);
    assert.deepEqual(requests[0].state.extraction, sdeCases[caseId].cheap);
    assert.equal(value.route, route);
    assert.equal(value.changes.length, changes);
    assert.deepEqual(
      value.final,
      route === "strong" ? sdeCases[caseId].strong : sdeCases[caseId].cheap,
    );
    assert.equal(
      captured!.steps[route === "strong" ? "strong-extraction" : "keep-cheap"]
        .status,
      "completed",
    );
    assert.equal(
      captured!.steps[route === "strong" ? "keep-cheap" : "strong-extraction"]
        .status,
      "untaken",
    );
    assert.equal(captured!.steps["compare-records"].status, "completed");
    assert.equal(captured!.steps.escalate.decision, route === "strong");
    if (caseId === "supported") assert.equal(value.overall, 0.96);
    if (caseId === "boundary") assert.equal(value.maxFieldProbability, 0.7);
  }
});

test("SDE verifier preserves absence-only checks, field context and the strict per-field gate excluding overall judgment", () => {
  const { questions, state } = verifyRequest("Source document", {
    registration_open_date: "",
    description: "Example event",
  });
  assert.deepEqual(
    Object.keys(questions).sort(),
    [
      "__overall__::judge",
      "registration_open_date::absence_wrong",
      ...[
        "name_desc_mismatch",
        "type_mismatch",
        "unreasonable",
        "hallucinated",
        "off_target",
        "incomplete",
        "format_violation",
      ].map((key) => `description::${key}`),
    ].sort(),
  );
  assert.equal(
    state.instruction,
    "Extract the structured record from this document",
  );
  assert.deepEqual(
    questions["registration_open_date::absence_wrong"].criteria,
    {
      true: "a value was wrongly omitted",
      false: "returning nothing is correct",
    },
  );
  assert.deepEqual(questions["description::hallucinated"].instructions, {
    field_spec: {
      path: "description",
      type: "string",
      description:
        "Description of the registration event, e.g. Registration opens for the fall semester; empty when not reported.",
      required: true,
    },
    extracted_field: "Example event",
    main_question:
      "Is the `extracted_field` unsupported by, or absent from, the source text?",
  });
  for (const [probability, fires] of [
    [0.7, false],
    [0.70001, true],
  ] as const) {
    const assessment = evaluateFlags({
      "__overall__::judge": { type: "noul", noul: 1 },
      "field::hallucinated": { type: "noul", noul: probability },
    });
    assert.equal(assessment.flags.length, 1);
    assert.equal(assessment.maxFieldProbability, probability);
    assert.equal(assessment.flags[0].fires, fires);
  }
});

test("SDE fixtures reject changed requests and cancellation leaves the continuation unreachable", async () => {
  const request = verifyRequest(
    sdeCases.fabricated.message,
    sdeCases.fabricated.cheap,
  );
  const transport = sdeSampleTransport("fabricated", 0);
  for (const body of [
    { ...request, state: { ...request.state, source_text: "different" } },
    { ...request, questions: {} },
  ])
    await assert.rejects(
      transport("https://sample.invalid", { body: JSON.stringify(body) }),
      /does not match/,
    );
  const controller = new AbortController();
  let captured: FlowRun | undefined;
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      controller.abort();
      throw new DOMException("Cancelled", "AbortError");
    },
  });
  await assert.rejects(
    createSdeFlow(0).run(
      { caseId: "fabricated", message: sdeCases.fabricated.message },
      {
        client,
        signal: controller.signal,
        devtools: {
          startFlow: () => ({
            update: (run) => {
              captured = run;
            },
            request: (_l, _t, cb) => cb(),
          }),
        },
      },
    ),
  );
  assert.equal(captured!.status, "cancelled");
  assert.equal(captured!.steps["strong-extraction"].status, "cancelled");
  assert.equal(captured!.steps["compare-records"].status, "cancelled");
});
