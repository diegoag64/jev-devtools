import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";
import {
  guardrailsCases,
  type GuardrailsCase,
} from "../../../cookbooks/guardrails/cases.js";
import {
  batteries,
  guardrailsFlow,
  policies,
  route,
  screenRequest,
  type GuardrailsResult,
} from "../../../cookbooks/guardrails/flow.js";
import { guardrailsSampleTransport } from "../../../cookbooks/guardrails/samples.js";
const client = (fetch: Fetch) =>
  new TypeSafeClient({
    apiKey: "sample-only",
    fetch,
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
  });

// Pin source wording independently of fixture generation; detects drift in either battery.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
test("guardrails preserves the official input/output batteries and four-level Score", () => {
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(canonical(batteries)))
      .digest("hex"),
    "cc619f4507fafd3b3cf9bca73be8d69d8b807efe10b430ea3b4005bec4b5335e",
  );
  for (const side of ["input", "output"] as const) {
    const request = screenRequest("Message", side);
    assert.deepEqual(request.questions, batteries[side]);
    assert.deepEqual(Object.keys(request.questions), [
      side === "input" ? "jailbreak" : "broke_policy",
      "harmful_request",
      "medical_advice",
      "self_harm",
      "severity",
    ]);
    assert.equal(request.model, "jev-1.12");
    assert.equal(request.state, "Message");
  }
});

test("every sample executes one whole-battery SDK request then reapplies policies without inference", async () => {
  const expected: Record<GuardrailsCase, [string, string]> = {
    ordinary: ["pass", "pass"],
    policy: ["block", "review"],
    review: ["review", "review"],
    strict: ["block", "review"],
    permissive: ["block", "block"],
    severity: ["block", "block"],
    severityOnly: ["pass", "pass"],
    overlap: ["support", "support"],
    refusal: ["pass", "pass"],
  };
  for (const caseId of Object.keys(guardrailsCases) as GuardrailsCase[]) {
    const requests: any[] = [];
    const sample = guardrailsSampleTransport(caseId, 0);
    const input = guardrailsCases[caseId];
    const result = await guardrailsFlow.run(
      { caseId, message: input.message },
      {
        client: client(async (url, init) => {
          requests.push(JSON.parse(String(init?.body)));
          return sample(url, init);
        }),
      },
    );
    const value = result.value as GuardrailsResult;
    assert.equal(result.outcome, expected[caseId][0], caseId);
    assert.equal(value.strict.action, expected[caseId][0]);
    assert.equal(value.permissive.action, expected[caseId][1]);
    assert.equal(requests.length, 1);
    assert.equal(value.side, input.side);
    assert.equal(requests[0].state, input.message);
    assert.deepEqual(requests[0].questions, batteries[input.side]);
    assert.deepEqual(
      value.strict.hazards.map((h) => h.probability),
      value.permissive.hazards.map((h) => h.probability),
    );
    if (caseId === "overlap")
      assert.deepEqual(
        value.strict.hazards.map((h) => h.action),
        ["block", "block", "block", "support"],
      );
    if (caseId === "severityOnly")
      assert.ok(value.strict.hazards.every((h) => !h.upgraded));
  }
});

test("inclusive review/action thresholds and severity upgrade boundaries execute through the public flow", async () => {
  for (const [hazard, probability, severity, strict, permissive] of [
    ["jailbreak", 0.349999, 3, "pass", "pass"],
    ["jailbreak", 0.35, 1.999999, "review", "review"],
    ["jailbreak", 0.350001, 2, "block", "block"],
    ["jailbreak", 0.699999, 0, "review", "review"],
    ["jailbreak", 0.7, 0, "block", "review"],
    ["jailbreak", 0.700001, 0, "block", "review"],
    ["jailbreak", 0.849999, 0, "block", "review"],
    ["jailbreak", 0.85, 0, "block", "block"],
    ["jailbreak", 0.850001, 0, "block", "block"],
    ["medical_advice", 0.95, 1.999999, "review", "review"],
    ["medical_advice", 0.95, 2, "block", "block"],
    ["medical_advice", 0.95, 2.000001, "block", "block"],
    ["self_harm", 0.7, 2, "support", "block"],
    ["self_harm", 0.85, 3, "support", "support"],
  ] as const) {
    let count = 0;
    const result = await guardrailsFlow.run(
      { caseId: "ordinary", message: guardrailsCases.ordinary.message },
      {
        client: client(async () => {
          count++;
          const answers = Object.fromEntries(
            Object.keys(batteries.input).map((key) => [
              key,
              key === "severity"
                ? { type: "score", score: severity }
                : { type: "noul", noul: key === hazard ? probability : 0 },
            ]),
          );
          return Response.json({ model: "boundary-fixture", answers });
        }),
      },
    );
    assert.equal(
      result.outcome,
      strict,
      `${hazard}=${probability}, severity=${severity}`,
    );
    assert.equal(
      (result.value as GuardrailsResult).permissive.action,
      permissive,
    );
    assert.equal(count, 1);
  }
});

test("precedence is independent of hazard iteration order; severity only upgrades review", () => {
  for (const policy of Object.values(policies)) {
    assert.equal(
      route(
        {
          nouls: {
            self_harm: 0.9,
            harmful_request: 0.99,
            medical_advice: 0.5,
            jailbreak: 0.99,
          },
          severity: 3,
        },
        policy,
      ).action,
      "support",
    );
    assert.equal(
      route(
        { nouls: { medical_advice: 0.5, harmful_request: 0.99 }, severity: 1 },
        policy,
      ).action,
      "block",
    );
    assert.equal(
      route(
        { nouls: { medical_advice: 0.5, jailbreak: 0.1 }, severity: 1 },
        policy,
      ).action,
      "review",
    );
    assert.equal(
      route({ nouls: { self_harm: 0.349999 }, severity: 3 }, policy).action,
      "pass",
    );
  }
});

test("unmatched sample input is rejected before dispatch and fixture transport rejects mismatched batteries", async () => {
  let calls = 0;
  await assert.rejects(
    guardrailsFlow.run(
      { caseId: "ordinary", message: "Edited input" },
      {
        client: client(async () => {
          calls++;
          throw new Error("must not dispatch");
        }),
      },
    ),
    /does not match/,
  );
  assert.equal(calls, 0);
  const fixture = guardrailsSampleTransport("ordinary", 0);
  for (const request of [
    screenRequest("Edited input", "input"),
    screenRequest(guardrailsCases.ordinary.message, "output"),
    {
      ...screenRequest(guardrailsCases.ordinary.message, "input"),
      model: "other",
    },
  ]) {
    await assert.rejects(
      fixture("https://sample.invalid", { body: JSON.stringify(request) }),
      /does not match/,
    );
  }
});
