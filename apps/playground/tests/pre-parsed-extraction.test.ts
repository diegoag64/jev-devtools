import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { FlowRun } from "jev-devtools/flow";
import {
  extractionCases,
  type ExtractionCase,
} from "../../../cookbooks/pre-parsed-extraction/cases.js";
import {
  extractionFlow,
  type ExtractionResult,
} from "../../../cookbooks/pre-parsed-extraction/flow.js";
import { extractionSampleTransport } from "../../../cookbooks/pre-parsed-extraction/samples.js";
import {
  findCandidates,
  selectionPlan,
  selectionRequest,
  toDecimal,
  normalizePhone,
} from "../../../cookbooks/pre-parsed-extraction/recipe.js";
const transcripts = JSON.parse(
  readFileSync(
    new URL(
      "../../../cookbooks/pre-parsed-extraction/fixtures.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
async function runCase(caseId: ExtractionCase) {
  const requests: any[] = [];
  const sample = extractionSampleTransport(caseId, 0);
  let run: FlowRun | undefined;
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
  const result = await extractionFlow.run(
    { caseId, message: extractionCases[caseId].message },
    {
      client,
      devtools: {
        startFlow: () => ({
          request: (_link, _trace, callback) => callback(),
          update: (snapshot) => {
            run = snapshot;
          },
        }),
      },
    },
  );
  return { value: result.value as ExtractionResult, requests, run: run! };
}
// New-port contract tests: request grouping/order and real task outputs are not
// covered by generic flow tests or other cookbooks. Expected transcripts are
// authored independently of the runtime builders; altered prompts must fail.
test("recipe helpers stay separate and sequential with exact state, questions, criteria and model", async () => {
  for (const caseId of Object.keys(extractionCases) as ExtractionCase[]) {
    const { requests, value, run } = await runCase(caseId);
    assert.equal(requests.length, transcripts[caseId].length, caseId);
    requests.forEach((request, i) => {
      const expected = transcripts[caseId][i].request;
      assert.deepEqual(
        {
          model: request.model,
          state: request.state,
          questions: request.questions,
        },
        expected,
      );
      for (const key of Object.keys(expected.questions))
        if (expected.questions[key].criteria)
          assert.deepEqual(
            Object.keys(request.questions[key].criteria),
            Object.keys(expected.questions[key].criteria),
          );
      assert.equal(Object.keys(request.questions).length, 1);
    });
    assert.equal(run.status, "success");
    assert.equal(run.steps["find-candidates"].status, "completed");
    assert.equal(value.document, extractionCases[caseId].message);
  }
});
test("email copies exact selected spans then lowercases without confidence gating; phone combines separate mobile and country answers", async () => {
  const email = await runCase("email");
  assert.equal(email.requests.length, 2);
  assert.deepEqual(
    email.value.rows.map((r) => r.normalized),
    ["dana.personal@gmail.com", "dana.whit@acme-corp.com"],
  );
  assert.equal(email.value.selections[0].confidence, 0.42);
  assert.equal(
    email.value.selections[0].probabilities["dana.personal@gmail.com"],
    0.8,
  );
  const phone = await runCase("phone");
  assert.equal(phone.requests.length, 2);
  assert.deepEqual(
    phone.value.selections.map((s) => s.role),
    ["mobile", "country"],
  );
  assert.equal(phone.value.rows[0].source, "(415) 555-0177");
  assert.equal(phone.value.rows[0].normalized, "+14155550177");
  const emailNone = await runCase("emailNone");
  assert.deepEqual(emailNone.value.candidates, ["DANA@example.com"]);
  assert.deepEqual(
    emailNone.value.rows.map((r) => r.normalized),
    [null, "dana@example.com"],
  );
});
test("money selects currency, total and credit before amount-dependent Nouls; strict credit threshold and exact decimals survive flow execution", async () => {
  for (const [caseId, expected] of [
    ["money", ["charge", "credit"]],
    ["boundary", ["charge", "credit"]],
    ["below", ["charge", "charge"]],
  ] as const) {
    const { value, requests, run } = await runCase(caseId);
    assert.equal(requests.length, 5);
    assert.deepEqual(
      value.selections.map((s) => s.role),
      ["currency", "total", "credit"],
    );
    assert.deepEqual(
      value.rows.map((r) => r.normalized),
      ["1315.50", "50.00"],
    );
    assert.deepEqual(
      value.rows.map((r) => r.currency),
      ["USD", "USD"],
    );
    assert.deepEqual(
      value.rows.map((r) => r.kind),
      expected,
    );
    assert.equal(
      requests[3].questions.q.instructions,
      "Is the amount $1,315.50 a credit or refund to the customer, not a charge?",
    );
    assert.equal(
      requests[4].questions.q.instructions,
      "Is the amount $50.00 a credit or refund to the customer, not a charge?",
    );
    assert.equal(
      run.steps["credit-checks"].collection!.items[0].run!.steps[
        "parse-decimal"
      ].status,
      "completed",
    );
    assert.equal(
      run.steps["credit-checks"].collection!.items[1].run!.steps[
        "parse-decimal"
      ].status,
      "completed",
    );
  }
});
test("none and empty candidates bypass parsers and credit requests with inspectable routes", async () => {
  const missing = await runCase("none");
  assert.equal(missing.requests.length, 3);
  assert.ok(
    missing.value.rows.every(
      (r) => r.normalized === null && r.probability === null && r.kind === null,
    ),
  );
  assert.equal(
    missing.run.steps["credit-checks"].collection!.items[0].run!.steps[
      "no-amount"
    ].status,
    "completed",
  );
  assert.equal(
    missing.run.steps["credit-checks"].collection!.items[0].run!.steps[
      "is-credit"
    ].status,
    "untaken",
  );
  const phone = await runCase("phoneNone");
  assert.equal(phone.requests.length, 2);
  assert.equal(phone.value.rows[0].normalized, null);
  const empty = await runCase("empty");
  assert.equal(empty.requests.length, 0);
  assert.deepEqual(empty.value.selections, []);
  assert.deepEqual(empty.value.rows, []);
  assert.equal(empty.run.steps["no-candidates"].status, "completed");
});
test("candidate finding over-finds, trims and deduplicates in first appearance order; option cap reserves none", () => {
  assert.deepEqual(
    findCandidates(
      "email",
      "B@example.com A@example.com B@example.com b@example.com",
    ),
    ["B@example.com", "A@example.com", "b@example.com"],
  );
  assert.deepEqual(
    findCandidates(
      "phone",
      "main (415) 555-0199, again (415) 555-0199; other +44 20 7946 0018",
    ),
    ["(415) 555-0199", "+44 20 7946 0018"],
  );
  assert.deepEqual(
    findCandidates("money", "$1,315.50 then € 50.00 then $1,315.50"),
    ["$1,315.50", "€ 50.00"],
  );
  const candidates = Array.from({ length: 254 }, (_, i) => `${i}@example.com`);
  const plan = selectionPlan("email", candidates);
  assert.equal(
    Object.keys(selectionRequest("document", plan[0]).questions.pick.criteria)
      .length,
    255,
  );
  assert.throws(
    () => selectionPlan("email", [...candidates, "overflow@example.com"]),
    /254 candidates/,
  );
  assert.deepEqual(selectionPlan("phone", []), []);
});
test("normalizers guard none, preserve decimal magnitude beyond Number precision, and document their locale scope", () => {
  assert.equal(toDecimal("$9,007,199,254,740,993.01"), "9007199254740993.01");
  assert.equal(toDecimal("€ 00012.30"), "12.30");
  assert.equal(toDecimal("¥100"), "100");
  for (const invalid of [
    "none",
    "€1.315,50",
    "$1,31.50",
    "$-50.00",
    "$5.1",
    "",
  ])
    assert.equal(toDecimal(invalid), null);
  assert.equal(normalizePhone("none", "US"), null);
  assert.equal(normalizePhone("(415) 555-0177", "unknown"), null);
  assert.equal(normalizePhone("not a phone", "US"), null);
  assert.equal(normalizePhone("020 7946 0018", "GB"), "+442079460018");
});
test("fixed sample validation rejects changed documents before transport; transcript rejects changed prompts, batching and reordered helpers", async () => {
  let count = 0;
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      count++;
      throw new Error("Unexpected request");
    },
  });
  await assert.rejects(
    extractionFlow.run(
      { caseId: "email", message: "edited document" },
      { client },
    ),
    /No extraction sample matches/,
  );
  await assert.rejects(
    extractionFlow.run(
      { caseId: "toString" as ExtractionCase, message: "" },
      { client },
    ),
    /No extraction sample matches/,
  );
  assert.equal(count, 0);
  const first = transcripts.email[0].request;
  for (const bad of [
    { ...first, state: "edited" },
    {
      ...first,
      questions: {
        pick: { ...first.questions.pick, instructions: "different" },
      },
    },
    {
      ...first,
      questions: { ...first.questions, second: first.questions.pick },
    },
    transcripts.email[1].request,
  ]) {
    await assert.rejects(
      extractionSampleTransport("email", 0)("https://sample.invalid", {
        body: JSON.stringify(bad),
      }),
      /does not match helper request 1/,
    );
  }
});
test("cancelling the first helper stops later selections and normalization", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  let count = 0;
  const sample = extractionSampleTransport("money", 10000);
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: (url, init) => {
      count++;
      started();
      return sample(url, init);
    },
  });
  const running = extractionFlow.run(
    { caseId: "money", message: extractionCases.money.message },
    { client, signal: controller.signal },
  );
  const rejected = assert.rejects(running);
  await began;
  controller.abort();
  await rejected;
  assert.equal(count, 1);
});
