import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { choice, noul, score, type Fetch } from "@typesafe-ai/sdk";
import { defineJevFlow, all, any, not } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import type { Trace } from "../src/protocol.js";
import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";
import {
  evaluateRecordedCondition,
  whatIfAcrossRuns,
  whatIfThresholds,
  type WhatIfChange,
} from "../src/what-if.js";

// The API must never throw on captured data: a throw becomes a failed assertion.
const safely =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R | string => {
    try {
      return fn(...args);
    } catch (error) {
      return `threw: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
const evaluate = safely(evaluateRecordedCondition);
const across = (...args: Parameters<typeof whatIfAcrossRuns>) => {
  const result = safely(whatIfAcrossRuns)(...args);
  assert.equal(typeof result, "object", String(result));
  return result as ReturnType<typeof whatIfAcrossRuns>;
};
const thresholds = (definition: FlowDefinition) => {
  const result = safely(whatIfThresholds)(definition);
  assert.ok(Array.isArray(result), String(result));
  return result as ReturnType<typeof whatIfThresholds>;
};

// Fixture transport: every answer is read back from the request state, so each
// run's inputs choose which branches the real flow engine takes.
const origin = "http://localhost:5197";
let sent = 0;
const transport: Fetch = async (_url, init) => {
  sent++;
  const request = JSON.parse(String(init?.body));
  const state = request.state as Record<string, unknown>;
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(
    request.questions as Record<string, { type: string }>,
  ))
    answers[name] =
      question.type === "noul"
        ? { type: "noul", noul: state[name] }
        : question.type === "choice"
          ? {
              type: "choice",
              choice: state[name],
              probabilities: state[`${name}Probabilities`] ?? {
                refund: 0.7,
                other: 0.3,
              },
              confidence: state[`${name}Confidence`] ?? 0.7,
            }
          : {
              type: "score",
              score: state[name],
              confidence: state[`${name}Confidence`] ?? 0.5,
              probabilities: { 0: 0.2, 1: 0.3, 2: 0.5 },
              legend: { 0: "bad", 1: "ok", 2: "good" },
            };
  return Response.json({ model: "sample", answers });
};
const clientOptions = {
  apiKey: "sample-only",
  fetch: transport,
  logLevel: "off" as const,
  retry: { maxRetries: 0 },
};
async function stream(
  inspector: ReturnType<typeof createJevDevtools>,
  path: string,
) {
  const response = await inspector.handle(
    new Request(origin + "/api/jev-devtools" + path),
  );
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  return JSON.parse(
    new TextDecoder().decode(first.value).split("data: ")[1].trim(),
  );
}
type Captured = {
  definitions: FlowDefinition[];
  runs: Map<string, FlowRun>;
  traces: Map<string, Trace>;
};
async function captured(
  inspector: ReturnType<typeof createJevDevtools>,
): Promise<Captured> {
  await delay(10); // Response capture lands asynchronously after the SDK call.
  const flows = (await stream(inspector, "/flows/events")) as FlowUpdate;
  const traces = (await stream(inspector, "/events")).traces as Trace[];
  return {
    definitions: flows.definitions,
    runs: new Map(flows.upserts.map((r) => [r.id, r])),
    traces: new Map(traces.map((t) => [t.id, t])),
  };
}
const definitionNamed = (c: Captured, name: string) => {
  const found = c.definitions.find((d) => d.name === name);
  assert.ok(found, `captured definition ${name}`);
  return found;
};
const ruleOf = (definition: FlowDefinition, nodeId: string) => {
  const node = definition.nodes.find((n) => n.id === nodeId);
  assert.ok(node && node.kind === "branch", `branch ${nodeId}`);
  return node.conditionRule;
};
const byKey = (changes: WhatIfChange[]) =>
  [...changes].sort((a, b) =>
    `${a.runId}/${a.nodeId}`.localeCompare(`${b.runId}/${b.nodeId}`),
  );
const change = (
  runId: string,
  nodeId: string,
  recorded: boolean,
): WhatIfChange => ({ runId, nodeId, recorded, replayed: !recorded });

// A: choice eq, all/not/any composition on noul, nested branch in an else path.
type RefundInput = {
  category: "refund" | "other";
  eligible: number;
  risky: number;
};
function refundFlow() {
  return defineJevFlow<RefundInput>("what-if-refund", (f) => {
    const triage = f.jev("triage", {
      state: { category: f.input.get("category") },
      questions: { category: choice("Refund?", { refund: null, other: null }) },
    });
    return f.branch("refund-request", {
      when: triage.answer("category").choice.eq("refund"),
      then: (b) => {
        const review = b.jev("review", {
          state: {
            eligible: f.input.get("eligible"),
            risky: f.input.get("risky"),
          },
          questions: { eligible: noul("Eligible?"), risky: noul("Risky?") },
        });
        return b.branch("approval", {
          when: all(
            review.answer("eligible").noul.gte(0.9),
            not(
              any(
                review.answer("risky").noul.gte(0.2),
                review.answer("eligible").noul.lt(0),
              ),
            ),
          ),
          then: (p) => p.output("approve"),
          else: (p) =>
            p.branch("escalation", {
              when: review.answer("risky").noul.lt(0.5),
              then: (q) => q.output("manual"),
              else: (q) => q.output("reject"),
            }),
        });
      },
      else: (b) => b.output("other"),
    });
  });
}
const refundInputs: [RefundInput, string][] = [
  [{ category: "other", eligible: 0.95, risky: 0.1 }, "other"], // r0
  [{ category: "refund", eligible: 0.94, risky: 0.1 }, "approve"], // r1
  [{ category: "refund", eligible: 0.8, risky: 0.3 }, "manual"], // r2
  [{ category: "refund", eligible: 0.95, risky: 0.6 }, "reject"], // r3
  [{ category: "refund", eligible: 0.9, risky: 0.19 }, "approve"], // r4: gte boundary
];
// Recorded decisions the real engine must produce for r0..r4 (undefined = untaken).
const refundDecisions: Record<string, (boolean | undefined)[]> = {
  "refund-request": [false, true, true, true, true],
  approval: [undefined, true, false, false, true],
  escalation: [undefined, undefined, true, false, undefined],
};

// B: Score and choice-probability references, ref-vs-ref, input refs mixed in.
type ScoredInput = {
  rating: number;
  refundP: number;
  vip: boolean;
  ratingConfidence: number;
  categoryConfidence: number;
};
function scoredFlow() {
  return defineJevFlow<ScoredInput>("what-if-scored", (f) => {
    const rate = f.jev("rate", {
      state: {
        rating: f.input.get("rating"),
        ratingConfidence: f.input.get("ratingConfidence"),
        category: "refund",
        categoryConfidence: f.input.get("categoryConfidence"),
        categoryProbabilities: { refund: f.input.get("refundP"), other: 0.1 },
      },
      questions: {
        rating: score("Rating?", ["bad", "ok", "good"]),
        category: choice("Category?", { refund: null, other: null }),
      },
    });
    return f.branch("quality", {
      when: any(
        rate.answer("rating").score.gte(1.5),
        not(rate.answer("category").probabilities.get("refund").lt(0.6)),
      ),
      then: (b) =>
        b.branch("vip", {
          when: any(
            rate.answer("rating").score.gte(2),
            f.input.get("vip").eq(true),
          ),
          then: (p) => p.output("priority"),
          else: (p) => p.output("standard"),
        }),
      else: (b) =>
        b.branch("calibrated", {
          when: rate
            .answer("rating")
            .confidence.gte(rate.answer("category").confidence),
          then: (p) => p.output("calibrated-low"),
          else: (p) => p.output("uncalibrated-low"),
        }),
    });
  });
}
const base = { vip: false, ratingConfidence: 0.5, categoryConfidence: 0.5 };
const scoredInputs: ScoredInput[] = [
  { ...base, rating: 1.8, refundP: 0.3 }, // b0 quality T, vip F (recorded)
  { ...base, rating: 1.0, refundP: 0.7, vip: true }, // b1 quality T via not(lt), vip T
  { ...base, rating: 2.5, refundP: 0.3 }, // b2 quality T, vip T by score alone
  { ...base, rating: 1.0, refundP: 0.5, ratingConfidence: 0.8, categoryConfidence: 0.6 }, // b3 quality F, calibrated T
  { ...base, rating: 1.2, refundP: 0.2, ratingConfidence: 0.4, categoryConfidence: 0.6 }, // b4 quality F, calibrated F
];
const scoredDecisions: Record<string, (boolean | undefined)[]> = {
  quality: [true, true, true, false, false],
  vip: [false, true, true, undefined, undefined],
  calibrated: [undefined, undefined, undefined, true, false],
};

// C: parallel lanes; one lane ends in its own branch, the join feeds a branch.
type LaneInput = { eligible: number; risky: number };
function laneFlow() {
  return defineJevFlow<LaneInput>("what-if-lanes", (f) => {
    const checks = f.parallel("checks", {
      eligibility: (lane) =>
        lane
          .jev("elig", {
            state: { eligible: f.input.get("eligible") },
            questions: { eligible: noul("Eligible?") },
          })
          .answer("eligible").noul,
      risk: (lane) => {
        const risk = lane.jev("risk", {
          state: { risky: f.input.get("risky") },
          questions: { risky: noul("Risky?") },
        });
        return lane.branch("risk-gate", {
          when: risk.answer("risky").noul.lt(0.3),
          then: (p) => p.output("low-risk"),
          else: (p) => p.output("high-risk"),
        });
      },
    });
    return f.branch("route", {
      when: checks.eligibility.gte(0.9),
      then: (p) => p.output("approved"),
      else: (p) => p.output("review"),
    });
  });
}
const laneInputs: LaneInput[] = [
  { eligible: 0.95, risky: 0.1 },
  { eligible: 0.5, risky: 0.4 },
  { eligible: 0.92, risky: 0.29 },
];
const laneDecisions: Record<string, boolean[]> = {
  "risk-gate": [true, false, true],
  route: [true, false, true],
};

type Scenario = {
  definition: FlowDefinition;
  runIds: string[];
  c: Captured;
  local: FlowDefinition;
};
async function record<T>(
  build: () => ReturnType<typeof defineJevFlow<T>>,
  inputs: T[],
  redact?: (path: string[], value: unknown) => unknown,
  limit?: number,
): Promise<Scenario & { outcomes: string[] }> {
  const inspector = createJevDevtools({ origin, enabled: true, redact, limit });
  try {
    const client = inspector.createClient(clientOptions, { source: "sample" });
    const flow = build();
    const results = [];
    for (const input of inputs)
      results.push(await flow.run(input, { client, devtools: inspector }));
    const c = await captured(inspector);
    return {
      definition: definitionNamed(c, flow.definition.name),
      runIds: results.map((r) => r.runId),
      outcomes: results.map((r) => r.outcome),
      c,
      local: flow.definition,
    };
  } finally {
    inspector.dispose();
  }
}
const refund = record(refundFlow, refundInputs.map(([i]) => i));
const scored = record(scoredFlow, scoredInputs);
const lanes = record(laneFlow, laneInputs);
// Same node ids, new definition identity (as after a hot reload).
const redefined = record(refundFlow, [refundInputs[1][0], refundInputs[2][0]]);
const replay = (
  s: Scenario,
  nodeId: string,
  run: number,
  overrides?: Record<string, number>,
) =>
  evaluate(
    nodeId,
    ruleOf(s.definition, nodeId),
    s.c.runs.get(s.runIds[run])!,
    s.c.traces,
    overrides,
  );
function assertRecorded(
  s: Scenario,
  expected: Record<string, (boolean | undefined)[]>,
) {
  for (const [nodeId, decisions] of Object.entries(expected))
    decisions.forEach((decision, i) =>
      assert.equal(
        s.c.runs.get(s.runIds[i])!.steps[nodeId].decision,
        decision,
        `premise: run ${i} ${nodeId} decision`,
      ),
    );
}

test("premise: real flow runs take the intended branches and link every Jev trace", async () => {
  const a = await refund;
  assert.deepEqual(
    a.outcomes,
    refundInputs.map(([, o]) => o),
  );
  assertRecorded(a, refundDecisions);
  for (const run of a.c.runs.values())
    for (const step of Object.values(run.steps))
      if (step.traceId) assert.ok(a.c.traces.get(step.traceId)?.result);
  const b = await scored;
  assert.deepEqual(b.outcomes, [
    "standard",
    "priority",
    "priority",
    "calibrated-low",
    "uncalibrated-low",
  ]);
  assertRecorded(b, scoredDecisions);
  const c = await lanes;
  assert.deepEqual(c.outcomes, ["approved", "review", "approved"]);
  assertRecorded(c, laneDecisions);
});

test("parity: with no overrides, replay reproduces every recorded decision of sequential and nested branches", async () => {
  const a = await refund;
  let checked = 0;
  for (const [nodeId, decisions] of Object.entries(refundDecisions))
    decisions.forEach((decision, i) => {
      if (decision === undefined) return;
      assert.equal(replay(a, nodeId, i), decision, `run ${i} ${nodeId}`);
      assert.equal(replay(a, nodeId, i, {}), decision, `run ${i} ${nodeId} {}`);
      checked++;
    });
  assert.equal(checked, 11);
  const b = await scored;
  for (const nodeId of ["quality", "calibrated"])
    scoredDecisions[nodeId].forEach((decision, i) => {
      if (decision !== undefined)
        assert.equal(replay(b, nodeId, i), decision, `run ${i} ${nodeId}`);
    });
});

test("parity: references to flow input make the whole rule unavailable, with no short-circuit", async () => {
  const b = await scored;
  // b2: score 2.5 >= 2 alone decides any(); b0: the score side is false.
  for (const i of [0, 1, 2]) assert.equal(replay(b, "vip", i), undefined);
});

test("parity: lane branches replay; parallel-join references are unavailable", async () => {
  const c = await lanes;
  laneDecisions["risk-gate"].forEach((d, i) =>
    assert.equal(replay(c, "risk-gate", i), d),
  );
  for (const i of [0, 1, 2]) assert.equal(replay(c, "route", i), undefined);
  assert.equal(replay(c, "route", 0, { "route#1": 0.5 }), undefined);
});

test("thresholds: ids, order, values, ops and probability flags come from captured rules", async () => {
  const a = await refund;
  const t = thresholds(a.definition);
  assert.deepEqual(
    t.map(({ id, nodeId, op, value, probability }) => ({
      id,
      nodeId,
      op,
      value,
      probability,
    })),
    [
      { id: "approval#0.1", nodeId: "approval", op: "gte", value: 0.9, probability: true },
      { id: "approval#1.0.0.1", nodeId: "approval", op: "gte", value: 0.2, probability: true },
      { id: "approval#1.0.1.1", nodeId: "approval", op: "lt", value: 0, probability: true },
      { id: "escalation#1", nodeId: "escalation", op: "lt", value: 0.5, probability: true },
    ],
  );
  ["review.eligible", "review.risky", "review.eligible", "review.risky"].forEach(
    (label, i) => {
      assert.equal(typeof t[i].label, "string");
      assert.ok(t[i].label.includes(label), `${t[i].label} ⊇ ${label}`);
    },
  );
  assert.deepEqual(thresholds(a.local), t);
  const b = thresholds((await scored).definition);
  assert.deepEqual(
    b.map(({ id, op, value, probability }) => [id, op, value, probability]),
    [
      ["quality#0.1", "gte", 1.5, false],
      ["quality#1.0.1", "lt", 0.6, false],
      ["vip#0.1", "gte", 2, false],
    ],
  );
  assert.ok(b[1].label.includes("rate.category.probabilities.refund"));
  const c = thresholds((await lanes).definition);
  assert.deepEqual(
    c.map(({ id, op, value, probability }) => [id, op, value, probability]),
    [
      ["risk-gate#1", "lt", 0.3, true],
      ["route#1", "gte", 0.9, false],
    ],
  );
  assert.ok(c[0].label.includes("risk.risky"));
  assert.ok(c[1].label.includes("checks.eligibility"));
});

test("override crossing a recorded value flips exactly that decision; non-crossing and boundary values keep it", async () => {
  const a = await refund;
  assert.equal(replay(a, "approval", 1, { "approval#0.1": 0.95 }), false);
  assert.equal(replay(a, "approval", 1, { "approval#0.1": 0.93 }), true);
  assert.equal(replay(a, "approval", 1, { "approval#0.1": 0.94 }), true); // gte inclusive
  assert.equal(replay(a, "escalation", 2, { "escalation#1": 0.3 }), false); // lt exclusive
  assert.equal(replay(a, "escalation", 2, { "escalation#1": 0.31 }), true);
  // Nested literals are addressed by operand path, not by position or value.
  assert.equal(replay(a, "approval", 1, { "approval#1.0.0.1": 0.05 }), false);
  assert.equal(replay(a, "approval", 1, { "approval#1.0.1.1": 0.92 }), true);
  assert.equal(replay(a, "approval", 4, { "approval#1.0.1.1": 0.92 }), false);
  // Overrides are scoped by node id.
  assert.equal(replay(a, "approval", 1, { "escalation#0.1": 0.99 }), true);
  assert.equal(replay(a, "approval", 1, { "approval#0.1": Infinity }), undefined);
  const b = await scored;
  assert.equal(replay(b, "quality", 1, { "quality#1.0.1": 0.75 }), false);
  assert.equal(replay(b, "quality", 1, { "quality#1.0.1": 0.65 }), true);
});

test("across runs: exact evaluated/unavailable counts and changed decisions", async () => {
  const a = await refund;
  const [r0, r1, r2, r3, r4] = a.runIds;
  const runsA = [...a.c.runs.values()];
  const none = across(a.definition, runsA, a.c.traces, {});
  assert.deepEqual(none, { evaluated: 11, unavailable: 0, changed: [] });
  const raised = across(a.definition, runsA, a.c.traces, {
    "approval#0.1": 0.95,
  });
  assert.equal(raised.evaluated, 11);
  assert.equal(raised.unavailable, 0);
  assert.deepEqual(
    byKey(raised.changed),
    byKey([change(r1, "approval", true), change(r4, "approval", true)]),
  );
  assert.deepEqual(
    across(a.definition, runsA, a.c.traces, { "approval#0.1": 0.85 })
      .changed,
    [],
  );
  assert.deepEqual(
    across(a.definition, runsA, a.c.traces, { "escalation#1": 0.9 })
      .changed,
    [change(r3, "escalation", false)],
  );
  const nested = across(a.definition, runsA, a.c.traces, {
    "approval#1.0.0.1": 0.05,
    "escalation#1": 0.3,
  });
  assert.deepEqual(
    byKey(nested.changed),
    byKey([
      change(r1, "approval", true),
      change(r4, "approval", true),
      change(r2, "escalation", true),
    ]),
  );
  void r0;
  // Runs of other definitions, including a re-definition with identical node ids, are ignored.
  const b = await scored;
  const again = await redefined;
  assert.notEqual(again.definition.id, a.definition.id);
  const mixed = [...runsA, ...b.c.runs.values(), ...again.c.runs.values()];
  const allTraces = new Map([...a.c.traces, ...b.c.traces, ...again.c.traces]);
  assert.deepEqual(across(a.definition, mixed, allTraces, {}), {
    evaluated: 11,
    unavailable: 0,
    changed: [],
  });
  assert.deepEqual(
    across(again.definition, mixed, allTraces, { "approval#0.1": 0.95 }),
    {
      evaluated: 5,
      unavailable: 0,
      changed: [change(again.runIds[0], "approval", true)],
    },
  );
  const scoredRuns = across(b.definition, mixed, b.c.traces, {
    "quality#1.0.1": 0.75,
  });
  assert.equal(scoredRuns.evaluated, 7);
  assert.equal(scoredRuns.unavailable, 3);
  assert.deepEqual(scoredRuns.changed, [change(b.runIds[1], "quality", true)]);
  const c = await lanes;
  const runsC = [...c.c.runs.values()];
  assert.deepEqual(across(c.definition, runsC, c.c.traces, {}), {
    evaluated: 3,
    unavailable: 3,
    changed: [],
  });
  const gate = across(c.definition, runsC, c.c.traces, {
    "risk-gate#1": 0.05,
    "route#1": 0.1,
  });
  assert.equal(gate.unavailable, 3);
  assert.deepEqual(
    byKey(gate.changed),
    byKey([
      change(c.runIds[0], "risk-gate", true),
      change(c.runIds[2], "risk-gate", true),
    ]),
  );
});

test("what-if is pure: no Jev calls and captured runs/traces are not mutated", async () => {
  const a = await refund;
  const before = sent;
  const snapshot = JSON.stringify([[...a.c.runs.values()], [...a.c.traces.values()], a.definition]);
  thresholds(a.definition);
  across(a.definition, [...a.c.runs.values()], a.c.traces, {
    "approval#0.1": 0.95,
  });
  assert.equal(sent, before);
  assert.equal(
    JSON.stringify([[...a.c.runs.values()], [...a.c.traces.values()], a.definition]),
    snapshot,
  );
  const source = readFileSync(new URL("../src/what-if.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:|require\(|import\(\s*["']node:/);
  assert.doesNotMatch(source, /from\s+["']\.\.\/(server|flow)/);
});

test("evicted, unlinked, or result-less traces make the rule unavailable", async () => {
  // limit 2: the second run's two requests evict the first run's two traces.
  const evicted = await record(
    refundFlow,
    [refundInputs[1][0], refundInputs[1][0]],
    undefined,
    2,
  );
  assert.equal(evicted.c.runs.size, 2);
  assert.equal(evicted.c.traces.size, 2);
  assert.equal(replay(evicted, "refund-request", 0), undefined);
  assert.equal(replay(evicted, "approval", 0), undefined);
  assert.equal(replay(evicted, "approval", 1), true);
  assert.deepEqual(
    across(evicted.definition, [...evicted.c.runs.values()], evicted.c.traces, {}),
    { evaluated: 2, unavailable: 2, changed: [] },
  );
  const a = await refund;
  const run = a.c.runs.get(a.runIds[1])!;
  const rule = ruleOf(a.definition, "approval");
  const unlinked = structuredClone(run);
  delete unlinked.steps.review.traceId;
  assert.equal(evaluate("approval", rule, unlinked, a.c.traces), undefined);
  assert.equal(
    evaluate("refund-request", ruleOf(a.definition, "refund-request"), unlinked, a.c.traces),
    true,
  );
  const missingStep = structuredClone(run);
  delete (missingStep.steps as Record<string, unknown>).review;
  assert.equal(evaluate("approval", rule, missingStep, a.c.traces), undefined);
  const traceId = run.steps.review.traceId!;
  const pending = new Map(a.c.traces);
  const { result: _drop, ...noResult } = a.c.traces.get(traceId)!;
  pending.set(traceId, { ...noResult, status: "pending" } as Trace);
  assert.equal(evaluate("approval", rule, run, pending), undefined);
});

test("redacted, mistyped and non-finite answer values make the rule unavailable", async () => {
  const redacted = await record(
    refundFlow,
    [refundInputs[1][0]],
    (path, value) => (path.at(-1) === "noul" ? "[redacted]" : value),
  );
  assert.equal(redacted.c.runs.get(redacted.runIds[0])!.steps.approval.decision, true);
  assert.equal(replay(redacted, "approval", 0), undefined);
  assert.equal(replay(redacted, "refund-request", 0), true);
  const a = await refund;
  const run = a.c.runs.get(a.runIds[1])!;
  const rule = ruleOf(a.definition, "approval");
  const traceId = run.steps.review.traceId!;
  for (const noulValue of ["0.94", Infinity, NaN, null, { value: 0.94 }]) {
    const traces = new Map(a.c.traces);
    const trace = structuredClone(a.c.traces.get(traceId)!);
    (trace.result!.answers.eligible as Record<string, unknown>).noul = noulValue;
    traces.set(traceId, trace);
    assert.equal(
      evaluate("approval", rule, run, traces),
      undefined,
      `noul ${String(noulValue)}`,
    );
  }
  const traces = new Map(a.c.traces);
  const trace = structuredClone(a.c.traces.get(traceId)!);
  delete (trace.result!.answers as Record<string, unknown>).eligible;
  traces.set(traceId, trace);
  assert.equal(evaluate("approval", rule, run, traces), undefined);
});

test("redacted, truncated and unavailable rules yield no thresholds and no replay", async () => {
  const hidden = await record(
    refundFlow,
    [refundInputs[1][0]],
    (path, value) =>
      path[0] === "conditions" && path.at(-1) === "value" ? "[redacted]" : value,
  );
  assert.deepEqual(thresholds(hidden.definition), []);
  assert.equal(replay(hidden, "approval", 0), undefined);
  const failed = await record(refundFlow, [refundInputs[1][0]], (path, value) => {
    if (path[0] === "conditions") throw new Error("no rule capture");
    return value;
  });
  assert.equal(ruleOf(failed.definition, "approval"), "[rule capture unavailable]");
  assert.deepEqual(thresholds(failed.definition), []);
  assert.equal(replay(failed, "approval", 0), undefined);
  assert.equal(failed.c.runs.get(failed.runIds[0])!.steps.approval.decision, true);

  // 128-node rule budget: 50 comparisons are captured as 42 plus a sentinel.
  const wide = await record(
    () =>
      defineJevFlow<{ eligible: number }>("what-if-wide", (f) => {
        const value = f
          .jev("score", {
            state: { eligible: f.input.get("eligible") },
            questions: { eligible: noul("Eligible?") },
          })
          .answer("eligible").noul;
        return f.branch("wide", {
          when: any(...Array.from({ length: 50 }, (_, i) => value.gte(0.6 + i / 1000))),
          then: (p) => p.output("yes"),
          else: (p) => p.output("no"),
        });
      }),
    [{ eligible: 0.7 }],
  );
  assert.equal(wide.c.runs.get(wide.runIds[0])!.steps.wide.decision, true);
  assert.equal(JSON.stringify(ruleOf(wide.definition, "wide")).includes('"[rule truncated]"'), true);
  assert.equal(replay(wide, "wide", 0), undefined); // first operand is true; no short-circuit
  const wideThresholds = thresholds(wide.definition);
  assert.equal(wideThresholds.length, 42);
  assert.deepEqual(
    [wideThresholds[0].id, wideThresholds[0].value, wideThresholds.at(-1)!.id, wideThresholds.at(-1)!.value],
    ["wide#0.1", 0.6, "wide#41.1", 0.6 + 41 / 1000],
  );
  // Capture depth limit: five nested NOTs truncate the comparison itself.
  const deep = await record(
    () =>
      defineJevFlow<{ eligible: number }>("what-if-deep", (f) => {
        const value = f
          .jev("score", {
            state: { eligible: f.input.get("eligible") },
            questions: { eligible: noul("Eligible?") },
          })
          .answer("eligible").noul;
        return f.branch("deep", {
          when: not(not(not(not(not(value.gte(0.4)))))),
          then: (p) => p.output("yes"),
          else: (p) => p.output("no"),
        });
      }),
    [{ eligible: 0.5 }],
  );
  assert.equal(deep.c.runs.get(deep.runIds[0])!.steps.deep.decision, false);
  assert.deepEqual(thresholds(deep.definition), []);
  assert.equal(replay(deep, "deep", 0), undefined);
});

test("malformed rules return undefined without throwing", async () => {
  const a = await refund;
  const run = a.c.runs.get(a.runIds[1])!;
  const eligible = {
    op: "reference",
    label: "review.eligible",
    probability: true,
    name: "eligible",
    stepId: "review",
    path: ["answers", "eligible", "noul"],
  };
  const literal = (value: unknown) => ({ op: "literal", value });
  // Control: a hand-built rule over the same reference evaluates.
  assert.equal(
    evaluate("x", { op: "gte", args: [eligible, literal(0.9)] }, run, a.c.traces),
    true,
  );
  assert.equal(
    evaluate("x", { op: "eq", args: [eligible, literal(0.94)] }, run, a.c.traces),
    true,
  );
  for (const rule of [
    undefined,
    null,
    42,
    "[rule truncated]",
    [],
    {},
    { op: "xor", args: [literal(true), literal(true)] },
    { op: "lt" },
    { op: "gte", args: "nope" },
    { op: "all", args: [literal(1)] },
    { op: "any", args: [literal("true")] },
    { op: "not", args: [literal(0)] },
    { op: "eq", args: [eligible, literal("0.94")] },
    { op: "eq", args: [literal({}), literal({})] },
    { op: "gte", args: [eligible, literal("[redacted]")] },
    { op: "gte", args: [{ ...eligible, path: "answers.eligible.noul" }, literal(0.9)] },
    { op: "gte", args: [{ ...eligible, path: ["answers", 7, "noul"] }, literal(0.9)] },
    { op: "gte", args: [{ ...eligible, stepId: "missing" }, literal(0.9)] },
    { op: "gte", args: [{ ...eligible, path: ["answers", "eligible", "constructor"] }, literal(0.9)] },
    // Missing and inherited keys are missing values, not null (server get() semantics).
    { op: "eq", args: [{ ...eligible, path: ["answers", "eligible", "missing"] }, literal(null)] },
    { op: "eq", args: [{ ...eligible, path: ["answers", "__proto__", "__proto__"] }, literal(null)] },
  ])
    assert.equal(
      evaluate("x", rule, run, a.c.traces),
      undefined,
      JSON.stringify(rule) ?? String(rule),
    );
  assert.deepEqual(
    thresholds({
      version: 1,
      id: "hand",
      name: "hand",
      nodes: [
        { id: "j", kind: "jev", dependencies: [], path: [], conditionRule: { op: "lt", args: [eligible, literal(1)] } as never },
        { id: "s", kind: "branch", dependencies: [], path: [], conditionRule: "[rule truncated]" },
        { id: "n", kind: "branch", dependencies: [], path: [] },
        { id: "rr", kind: "branch", dependencies: [], path: [], conditionRule: { op: "gte", args: [eligible, eligible] } as never },
        { id: "ll", kind: "branch", dependencies: [], path: [], conditionRule: { op: "gte", args: [literal(1), literal(2)] } as never },
        { id: "ok", kind: "branch", dependencies: [], path: [], conditionRule: { op: "lt", args: [eligible, literal(0.5)] } as never },
      ],
    }).map((t) => t.id),
    ["ok#1"],
  );
});
