import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  TypeSafeClient,
  box,
  choice,
  image,
  noul,
  type Fetch,
} from "@typesafe-ai/sdk";
import {
  compareWithFixture,
  defineJevFlow,
  formatComparison,
  replayClient,
  type FlowFixture,
  type FlowRunOptions,
  type FlowObserver,
} from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import { flowFixture } from "../src/flow-fixture.js";
import type { Trace } from "../src/protocol.js";
import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";

// Compare-with-fixture gate. The API under test is loaded dynamically so that, before the
// feature lands, each check fails on an explicit "must export" assertion.
//
// Contract pinned here beyond the written spec:
// - Answer fields are the scalar leaves of each answer object, dotted for nested objects
//   ("box.left", "probabilities.refund"), excluding the "type" discriminator. Field order is
//   the recorded answer's key order (depth first), then fields present only live.
// - formatComparison lines, in this order: outcome, value, decisions (definition order),
//   steps (recorded-only, then live-only), answers (comparison order). Formats:
//     outcome: <recorded> -> <live>
//     value: <JSON or (none)> -> <JSON or (none)>
//     decision <stepId>: <then|else|(not run)> -> <then|else|(not run)>
//     step <stepId>: recorded only | live only
//     <stepId>.<question>.<field>: <recorded> -> <live>[ (<signed delta>)]
//   Numbers in answer lines use 2 decimals, deltas carry an explicit sign, a missing side is
//   "(none)". An unchanged comparison formats as exactly "no changes from fixture".
type AnswerValue = string | number | boolean | null;
type AnswerChange = {
  stepId: string;
  question: string;
  field: string;
  recorded?: AnswerValue;
  live?: AnswerValue;
  delta?: number;
  changed: boolean;
};
type FixtureComparison = {
  changed: boolean;
  outcome: { recorded: string; live: string; changed: boolean };
  value: { recorded?: unknown; live?: unknown; changed: boolean };
  decisions: {
    stepId: string;
    recorded?: boolean;
    live?: boolean;
    changed: boolean;
  }[];
  answers: AnswerChange[];
  steps: { onlyRecorded: string[]; onlyLive: string[] };
  liveFixture: FlowFixture;
};
type AnyFlow = {
  run(
    input: never,
    options: FlowRunOptions,
  ): Promise<{ runId: string; outcome: string; value?: unknown }>;
  definition: FlowDefinition;
};
type CompareApi = {
  compareWithFixture: (
    flow: AnyFlow,
    input: unknown,
    fixture: FlowFixture,
    options: FlowRunOptions & { tolerance?: number },
  ) => Promise<FixtureComparison>;
  formatComparison: (comparison: FixtureComparison) => string;
};
async function compareApi(): Promise<CompareApi> {
  // Cast: these exports do not exist until the feature is built; the typeof checks are the gate.
  const flow = (await import("../flow/index.js")) as unknown as Partial<CompareApi>;
  assert.equal(
    typeof flow.compareWithFixture,
    "function",
    "jev-devtools/flow must export compareWithFixture",
  );
  assert.equal(
    typeof flow.formatComparison,
    "function",
    "jev-devtools/flow must export formatComparison",
  );
  return {
    compareWithFixture: flow.compareWithFixture!,
    formatComparison: flow.formatComparison!,
  };
}

const origin = "http://localhost:5197";
const options = (fetch: Fetch) => ({
  apiKey: "sample-only",
  fetch,
  logLevel: "off" as const,
  retry: { maxRetries: 0 },
});
const liveClient = (fetch: Fetch) => new TypeSafeClient(options(fetch));
/** JSON-normal form: drops undefined keys and rounds float noise so deltas compare exactly. */
const norm = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v,
    ),
  );
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
  "base64",
);

// ---- Flows under test -------------------------------------------------------
type Ticket = { category: "refund" | "other"; eligible: number; risky: number };
const categoryQ = {
  category: choice("Category?", { refund: null, other: null }),
};
const reviewQ = { eligible: noul("Eligible?"), risky: noul("Risky?") };
/** Sequential branch with a nested branch and an output that carries a value. */
function refundFlow() {
  return defineJevFlow<Ticket>("refund", (flow) => {
    const triage = flow.jev("triage", { state: flow.input, questions: categoryQ });
    return flow.branch("refund-request", {
      when: triage.answer("category").choice.eq("refund"),
      then: (branch) => {
        const review = branch.jev("review", {
          state: { ticket: flow.input, category: triage.answer("category").choice },
          questions: reviewQ,
        });
        return branch.branch("approval", {
          when: review.answer("eligible").noul.gte(0.9),
          then: (p) =>
            p.output("approve", {
              eligibility: review.answer("eligible").noul,
              category: triage.answer("category").choice,
            }),
          else: (p) => p.output("manual"),
        });
      },
      else: (p) => p.output("other"),
    });
  });
}
const triageBody = (
  category: string,
  probabilities: Record<string, number> = { refund: 0.8, other: 0.2 },
  confidence = 0.8,
) => ({
  model: "sample",
  answers: {
    category: { type: "choice", choice: category, confidence, probabilities },
  },
});
const reviewBody = (eligible: number, risky: number) => ({
  model: "sample",
  answers: {
    eligible: { type: "noul", noul: eligible },
    risky: { type: "noul", noul: risky },
  },
});
const refundFixture = (eligible = 0.94): FlowFixture => ({
  version: 1,
  flow: "refund",
  steps: { triage: triageBody("refund"), review: reviewBody(eligible, 0.1) },
});
/** Live transport: answers come from the arguments, never from the request. */
function refundLive(
  triage: ReturnType<typeof triageBody>,
  review: ReturnType<typeof reviewBody>,
  calls: string[] = [],
): Fetch {
  return async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    calls.push(request.questions.category ? "triage" : "review");
    return Response.json(request.questions.category ? triage : review);
  };
}

/** Each branch route runs its own jev step, so a flip has steps on both sides. */
function escalationFlow() {
  return defineJevFlow<{ text: string }>("escalation", (flow) => {
    const screen = flow.jev("screen", {
      state: { step: "screen", text: flow.input.get("text") },
      questions: { risk: noul("Risky?") },
    });
    return flow.branch("route", {
      when: screen.answer("risk").noul.lt(0.5),
      then: (path) => {
        path.jev("fast-check", { state: { step: "fast-check" }, questions: { ok: noul("OK?") } });
        return path.output("fast", { risk: screen.answer("risk").noul });
      },
      else: (path) => {
        const deep = path.jev("deep-check", {
          state: { step: "deep-check" },
          questions: { thorough: noul("Thorough?") },
        });
        return path.output("deep", {
          risk: screen.answer("risk").noul,
          thorough: deep.answer("thorough").noul,
        });
      },
    });
  });
}
const noulBody = (question: string, value: number) => ({
  model: "sample",
  answers: { [question]: { type: "noul", noul: value } },
});
/** Answers JSON requests by their `state.step` marker; image requests are multipart. */
function stepTransport(
  bodies: Record<string, unknown>,
  calls: string[] = [],
  delays: Record<string, number> = {},
): Fetch {
  return async (_url, init) => {
    const step =
      typeof init?.body === "string" ? JSON.parse(init.body).state.step : "photo";
    calls.push(step);
    if (delays[step]) await delay(delays[step]);
    return Response.json(bodies[step]);
  };
}
const escalationFixture: FlowFixture = {
  version: 1,
  flow: "escalation",
  steps: { screen: noulBody("risk", 0.3), "fast-check": noulBody("ok", 0.8) },
};
const escalationLive = {
  screen: noulBody("risk", 0.7),
  "deep-check": noulBody("thorough", 0.9),
  "fast-check": noulBody("ok", 0.8),
};

/** Parallel lanes + join (same shape as the replay gate's flow). */
function parallelFlow() {
  const p = { p: noul("Probability?") };
  return defineJevFlow<{ ticket: string }>("parallel-review", (flow) => {
    const checks = flow.parallel("checks", {
      eligibility: (lane) => {
        const photo = lane.jev("photo", {
          state: { step: "photo", photo: image(png) },
          questions: p,
        });
        return lane
          .jev("eligibility", {
            state: { step: "eligibility", photo: photo.answer("p").noul },
            questions: p,
          })
          .answer("p").noul;
      },
      risk: (lane) =>
        lane
          .jev("risk", { state: { step: "risk", ticket: flow.input }, questions: p })
          .answer("p").noul,
    });
    const combined = flow.jev("combined", {
      state: { step: "combined", eligibility: checks.eligibility, risk: checks.risk },
      questions: { ready: noul("Ready?") },
    });
    return flow.branch("ready-route", {
      when: combined.answer("ready").noul.gte(0.9),
      then: (path) =>
        path.output("ready", {
          eligibility: checks.eligibility,
          risk: checks.risk,
          readiness: combined.answer("ready").noul,
        }),
      else: (path) => path.output("hold"),
    });
  });
}

/** A branch inside a lane: its decision can flip while the flow outcome and value stay the same. */
function laneGateFlow() {
  return defineJevFlow<{ id: string }>("lane-gate", (flow) => {
    flow.parallel("checks", {
      gate: (lane) => {
        const gate = lane.jev("gate", { state: { step: "gate" }, questions: { ok: noul("OK?") } });
        return lane.branch("gate-check", {
          when: gate.answer("ok").noul.gte(0.5),
          then: (p) => p.output("pass"),
          else: (p) => p.output("fail"),
        });
      },
      audit: (lane) =>
        lane.jev("audit", { state: { step: "audit" }, questions: { ok: noul("OK?") } }).answer("ok").noul,
    });
    return flow.output("done");
  });
}

/** Box answers flatten to dotted fields. */
function locateFlow() {
  return defineJevFlow<{ id: string }>("locate", (flow) => {
    const found = flow.jev("locate", { state: { step: "locate" }, questions: { mug: box("Mug region") } });
    return flow.output("found", { left: found.answer("mug").box });
  });
}
const boxBody = (left: number) => ({
  model: "sample",
  answers: {
    mug: { type: "box", box: { left, top: 0.19, right: 0.78, bottom: 0.81 }, confidence: 0.92 },
  },
});

/** Input-only branch: replay of an uncaptured route rejects naming the step. */
function tieredFlow() {
  return defineJevFlow<{ tier: "vip" | "standard" }>("tiered", (flow) =>
    flow.branch("tier", {
      when: flow.input.get("tier").eq("vip"),
      then: (path) => {
        path.jev("vip-check", { state: flow.input, questions: { ok: noul("OK?") } });
        return path.output("vip");
      },
      else: (path) => {
        const check = path.jev("standard-check", { state: flow.input, questions: { ok: noul("OK?") } });
        return path.output("standard", { ok: check.answer("ok").noul });
      },
    }),
  );
}

// ---- Helpers ----------------------------------------------------------------
async function history(inspector: ReturnType<typeof createJevDevtools>, path = "/flows/events") {
  const response = await inspector.handle(new Request(origin + "/api/jev-devtools" + path));
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  return JSON.parse(new TextDecoder().decode(first.value).split("data: ")[1].trim());
}
/** No network: global fetch counts and throws; TYPESAFE_API_KEY is unset. */
async function offline<T>(body: () => Promise<T>): Promise<{ result: T; network: number }> {
  const realFetch = globalThis.fetch;
  const key = process.env.TYPESAFE_API_KEY;
  let network = 0;
  globalThis.fetch = (async () => {
    network++;
    throw new Error("network forbidden for the recorded side");
  }) as typeof fetch;
  delete process.env.TYPESAFE_API_KEY;
  try {
    return { result: await body(), network };
  } finally {
    globalThis.fetch = realFetch;
    if (key !== undefined) process.env.TYPESAFE_API_KEY = key;
  }
}
const noulChange = (
  stepId: string,
  question: string,
  recorded: number,
  live: number,
  changed: boolean,
) => ({ stepId, question, field: "noul", recorded, live, delta: live - recorded, changed });
const triageChanges = (liveChoice: string, changedChoice: boolean) => [
  { stepId: "triage", question: "category", field: "choice", recorded: "refund", live: liveChoice, changed: changedChoice },
  { stepId: "triage", question: "category", field: "confidence", recorded: 0.8, live: 0.8, delta: 0, changed: false },
  { stepId: "triage", question: "category", field: "probabilities.refund", recorded: 0.8, live: 0.8, delta: 0, changed: false },
  { stepId: "triage", question: "category", field: "probabilities.other", recorded: 0.2, live: 0.2, delta: 0, changed: false },
];

// ---- 1. Identical answers -----------------------------------------------------
test("identical live answers: nothing changed, every flag false, deltas 0", async () => {
  const api = await compareApi();
  const input: Ticket = { category: "refund", eligible: 0.94, risky: 0.1 };
  const comparison = await api.compareWithFixture(refundFlow(), input, refundFixture(), {
    client: liveClient(refundLive(triageBody("refund"), reviewBody(0.94, 0.1))),
  });
  const { liveFixture: _, ...rest } = comparison;
  assert.deepEqual(norm(rest), {
    changed: false,
    outcome: { recorded: "approve", live: "approve", changed: false },
    value: {
      recorded: { eligibility: 0.94, category: "refund" },
      live: { eligibility: 0.94, category: "refund" },
      changed: false,
    },
    decisions: [
      { stepId: "refund-request", recorded: true, live: true, changed: false },
      { stepId: "approval", recorded: true, live: true, changed: false },
    ],
    answers: [
      ...triageChanges("refund", false),
      noulChange("review", "eligible", 0.94, 0.94, false),
      noulChange("review", "risky", 0.1, 0.1, false),
    ],
    steps: { onlyRecorded: [], onlyLive: [] },
  });
  assert.equal(api.formatComparison(comparison), "no changes from fixture");
});

// ---- 2. Drift below the threshold ----------------------------------------------
test("answer drift that keeps every decision and the value: changed false, delta shown, tolerance applies", async () => {
  const api = await compareApi();
  // risky is not part of the output value or any condition, so only the answer moves.
  const input: Ticket = { category: "refund", eligible: 0.94, risky: 0.1 };
  const run = (tolerance?: number) =>
    api.compareWithFixture(refundFlow(), input, refundFixture(), {
      client: liveClient(refundLive(triageBody("refund"), reviewBody(0.94, 0.15))),
      ...(tolerance === undefined ? {} : { tolerance }),
    });
  const strict = await run();
  assert.deepEqual(
    norm([strict.outcome, strict.value.changed, strict.decisions.map((d) => d.changed)]),
    [{ recorded: "approve", live: "approve", changed: false }, false, [false, false]],
    "premise: drift keeps outcome, value and decisions",
  );
  assert.equal(strict.changed, false, "answer drift alone must not set changed");
  assert.deepEqual(norm(strict.answers.filter((a) => a.stepId === "review")), [
    noulChange("review", "eligible", 0.94, 0.94, false),
    noulChange("review", "risky", 0.1, 0.15, true),
  ].map(norm));
  assert.equal(api.formatComparison(strict), "review.risky.noul: 0.10 -> 0.15 (+0.05)");
  // Tolerance 0.1 hides the drift but keeps the delta.
  const tolerant = await run(0.1);
  assert.equal(tolerant.changed, false);
  assert.deepEqual(
    norm(tolerant.answers.find((a) => a.stepId === "review" && a.question === "risky")),
    norm(noulChange("review", "risky", 0.1, 0.15, false)),
  );
  assert.equal(tolerant.answers.some((a) => a.changed), false);
  assert.equal(api.formatComparison(tolerant), "no changes from fixture");
});

test("a value change with the same decisions sets changed", async () => {
  const api = await compareApi();
  const input: Ticket = { category: "refund", eligible: 0.94, risky: 0.1 };
  const comparison = await api.compareWithFixture(refundFlow(), input, refundFixture(), {
    client: liveClient(refundLive(triageBody("refund"), reviewBody(0.92, 0.1))),
    tolerance: 0.1,
  });
  assert.deepEqual(
    norm([comparison.outcome.changed, comparison.decisions.map((d) => d.changed), comparison.answers.some((a) => a.changed)]),
    [false, [false, false], false],
    "premise: same outcome and decisions, drift within tolerance",
  );
  assert.deepEqual(norm(comparison.value), {
    recorded: { eligibility: 0.94, category: "refund" },
    live: { eligibility: 0.92, category: "refund" },
    changed: true,
  });
  assert.equal(comparison.changed, true);
  assert.equal(
    api.formatComparison(comparison),
    'value: {"eligibility":0.94,"category":"refund"} -> {"eligibility":0.92,"category":"refund"}',
  );
});

// ---- 3. Drift that flips a branch ------------------------------------------------
test("a flipped decision reports outcome, value, decisions and the steps each route ran", async () => {
  const api = await compareApi();
  const input: Ticket = { category: "refund", eligible: 0.94, risky: 0.1 };
  const triageFlip = await api.compareWithFixture(refundFlow(), input, refundFixture(), {
    client: liveClient(refundLive(triageBody("other"), reviewBody(0.94, 0.1))),
  });
  const { liveFixture: _, ...rest } = triageFlip;
  assert.deepEqual(norm(rest), {
    changed: true,
    outcome: { recorded: "approve", live: "other", changed: true },
    value: { recorded: { eligibility: 0.94, category: "refund" }, changed: true },
    decisions: [
      { stepId: "refund-request", recorded: true, live: false, changed: true },
      { stepId: "approval", recorded: true, changed: true },
    ],
    answers: triageChanges("other", true),
    steps: { onlyRecorded: ["review"], onlyLive: [] },
  });

  const escalation = await api.compareWithFixture(escalationFlow(), { text: "t" }, escalationFixture, {
    client: liveClient(stepTransport(escalationLive)),
  });
  assert.deepEqual(norm(escalation.steps), { onlyRecorded: ["fast-check"], onlyLive: ["deep-check"] });
  assert.deepEqual(norm(escalation.answers), [norm({ ...noulChange("screen", "risk", 0.3, 0.7, true) })]);
  assert.deepEqual(norm(escalation.decisions), [{ stepId: "route", recorded: true, live: false, changed: true }]);
  assert.deepEqual(norm(escalation.value), {
    recorded: { risk: 0.3 },
    live: { risk: 0.7, thorough: 0.9 },
    changed: true,
  });
});

test("a decision flip alone sets changed even when outcome and value match", async () => {
  const api = await compareApi();
  const fixture: FlowFixture = {
    version: 1,
    flow: "lane-gate",
    steps: { gate: noulBody("ok", 0.6), audit: noulBody("ok", 0.5) },
  };
  const comparison = await api.compareWithFixture(laneGateFlow(), { id: "x" }, fixture, {
    client: liveClient(stepTransport({ gate: noulBody("ok", 0.4), audit: noulBody("ok", 0.5) })),
    tolerance: 0.5,
  });
  assert.deepEqual(norm([comparison.outcome, comparison.value]), [
    { recorded: "done", live: "done", changed: false },
    { changed: false },
  ], "premise: same outcome, no value");
  assert.deepEqual(norm(comparison.decisions), [{ stepId: "gate-check", recorded: true, live: false, changed: true }]);
  assert.equal(comparison.answers.some((a) => a.changed), false, "premise: drift is within tolerance");
  assert.equal(comparison.changed, true);
});

// ---- 4. Choice labels, probabilities and nested fields -------------------------------
test("choice label changes, per-label probabilities and nested box fields", async () => {
  const api = await compareApi();
  const input: Ticket = { category: "refund", eligible: 0.94, risky: 0.1 };
  const comparison = await api.compareWithFixture(refundFlow(), input, refundFixture(), {
    client: liveClient(
      refundLive(triageBody("other", { refund: 0.3, other: 0.6, spam: 0.1 }, 0.6), reviewBody(0.94, 0.1)),
    ),
  });
  assert.deepEqual(norm(comparison.answers), [
    { stepId: "triage", question: "category", field: "choice", recorded: "refund", live: "other", changed: true },
    { stepId: "triage", question: "category", field: "confidence", recorded: 0.8, live: 0.6, delta: -0.2, changed: true },
    { stepId: "triage", question: "category", field: "probabilities.refund", recorded: 0.8, live: 0.3, delta: -0.5, changed: true },
    { stepId: "triage", question: "category", field: "probabilities.other", recorded: 0.2, live: 0.6, delta: 0.4, changed: true },
    { stepId: "triage", question: "category", field: "probabilities.spam", live: 0.1, changed: true },
  ]);
  assert.equal(api.formatComparison(comparison), [
    "outcome: approve -> other",
    'value: {"eligibility":0.94,"category":"refund"} -> (none)',
    "decision refund-request: then -> else",
    "decision approval: then -> (not run)",
    "step review: recorded only",
    "triage.category.choice: refund -> other",
    "triage.category.confidence: 0.80 -> 0.60 (-0.20)",
    "triage.category.probabilities.refund: 0.80 -> 0.30 (-0.50)",
    "triage.category.probabilities.other: 0.20 -> 0.60 (+0.40)",
    "triage.category.probabilities.spam: (none) -> 0.10",
  ].join("\n"));

  const located = await api.compareWithFixture(
    locateFlow(),
    { id: "m" },
    { version: 1, flow: "locate", steps: { locate: boxBody(0.35) } },
    { client: liveClient(stepTransport({ locate: boxBody(0.4) })) },
  );
  assert.deepEqual(
    norm(located.answers.map(({ field, delta, changed }) => ({ field, delta, changed }))),
    [
      { field: "box.left", delta: 0.05, changed: true },
      { field: "box.top", delta: 0, changed: false },
      { field: "box.right", delta: 0, changed: false },
      { field: "box.bottom", delta: 0, changed: false },
      { field: "confidence", delta: 0, changed: false },
    ],
  );
});

// ---- 5. Parallel lanes ------------------------------------------------------------
test("parallel lanes are compared by step, not by execution order", async () => {
  const api = await compareApi();
  // Fixture keys in reverse definition order.
  const fixture: FlowFixture = {
    version: 1,
    flow: "parallel-review",
    steps: {
      combined: noulBody("ready", 0.97),
      risk: noulBody("p", 0.05),
      eligibility: noulBody("p", 0.95),
      photo: noulBody("p", 0.7),
    },
  };
  const calls: string[] = [];
  // The live risk call is slowed so the live completion order differs from the replay's.
  const comparison = await api.compareWithFixture(parallelFlow(), { ticket: "t" }, fixture, {
    client: liveClient(
      stepTransport(
        {
          photo: noulBody("p", 0.7),
          eligibility: noulBody("p", 0.95),
          risk: noulBody("p", 0.15),
          combined: noulBody("ready", 0.97),
        },
        calls,
        { risk: 40 },
      ),
    ),
  });
  assert.deepEqual([...calls].sort(), ["combined", "eligibility", "photo", "risk"], "premise: four live calls");
  assert.deepEqual(norm(comparison.answers), [
    noulChange("photo", "p", 0.7, 0.7, false),
    noulChange("eligibility", "p", 0.95, 0.95, false),
    noulChange("risk", "p", 0.05, 0.15, true),
    { stepId: "combined", question: "ready", field: "noul", recorded: 0.97, live: 0.97, delta: 0, changed: false },
  ].map(norm));
  assert.deepEqual(norm(comparison.decisions), [{ stepId: "ready-route", recorded: true, live: true, changed: false }]);
  assert.deepEqual(norm(comparison.steps), { onlyRecorded: [], onlyLive: [] });
  assert.equal(comparison.outcome.changed, false);
});

// ---- 6/7. Rejections ---------------------------------------------------------------
test("a fixture that does not cover the input rejects with the replay error", async () => {
  const api = await compareApi();
  const fixture: FlowFixture = {
    version: 1,
    flow: "tiered",
    steps: { "standard-check": noulBody("ok", 0.88) },
  };
  const replayError = await tieredFlow()
    .run({ tier: "vip" }, { client: replayClient(fixture) })
    .then(() => "resolved", (e: Error) => e.message);
  assert.match(replayError, /vip-check/, "premise: replay alone rejects naming the step");
  const outcome = await api
    .compareWithFixture(tieredFlow(), { tier: "vip" }, fixture, {
      client: liveClient(async () => Response.json(noulBody("ok", 0.88))),
    })
    .then(() => "resolved", (e: Error) => e.message);
  assert.ok(
    outcome.includes(replayError),
    `rejection must include the replay error ${JSON.stringify(replayError)}, got ${JSON.stringify(outcome)}`,
  );
});

test("a live client that fails rejects with its error", async () => {
  const api = await compareApi();
  const failure = new Error("live model unavailable");
  const client = { systemOne: () => Promise.reject(failure) } as unknown as FlowRunOptions["client"];
  const caught = await api
    .compareWithFixture(refundFlow(), { category: "refund", eligible: 0.94, risky: 0.1 }, refundFixture(), { client })
    .then(() => undefined, (e: unknown) => e);
  assert.equal(caught, failure, "rejects with the live run's own error");
});

// ---- 8/9. Devtools and the live fixture ------------------------------------------------
test("devtools records only the live run, linked to its traces, and liveFixture matches flowFixture", async () => {
  const api = await compareApi();
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const client = inspector.createClient(options(stepTransport(escalationLive)), { source: "sample" });
    const comparison = await api.compareWithFixture(escalationFlow(), { text: "t" }, escalationFixture, {
      client,
      devtools: inspector,
    });
    assert.equal(comparison.outcome.live, "deep", "premise: live run took the else route");
    await delay(5); // Trace results are captured from a response clone after the step resolves.
    const flows = (await history(inspector)) as FlowUpdate;
    assert.deepEqual(
      flows.upserts.map((r) => [r.name, r.status, r.outcome]),
      [["escalation", "success", "deep"]],
      "exactly one run, the live one",
    );
    const run = flows.upserts[0] as FlowRun;
    const traces = (await history(inspector, "/events")).traces as Trace[];
    assert.deepEqual(
      traces
        .map((t) => ({
          stepId: t.flow?.stepId,
          linked:
            !!t.flow &&
            t.flow.runId === run.id &&
            run.steps[t.flow.stepId]?.traceId === t.id &&
            run.steps[t.flow.stepId]?.executionId === t.flow.executionId,
        }))
        .sort((a, b) => String(a.stepId).localeCompare(String(b.stepId))),
      [
        { stepId: "deep-check", linked: true },
        { stepId: "screen", linked: true },
      ],
    );
    const definition = flows.definitions.find((d) => d.id === run.definitionId)!;
    const built = flowFixture(definition, run, new Map(traces.map((t) => [t.id, t])));
    assert.deepEqual(built.missing, [], "premise: capture complete");
    assert.deepEqual(norm(comparison.liveFixture), norm(built.fixture));
  } finally {
    inspector.dispose();
  }
});

test("comparison capture stays complete and accurate when a recording observer fails or mutates its arguments", async (t) => {
  const api = await compareApi();
  for (const mode of ["before", "after", "reject", "replace", "skip", "mutate-update", "mutate-link"] as const) {
    await t.test(mode, async () => {
      const calls: string[] = [];
      const devtools: FlowObserver = {
        startFlow() {
          return {
            update(run) {
              if (mode === "mutate-update") {
                run.steps.approval.decision = false;
                run.steps.review.status = "error";
              }
            },
            request<T>(link: { stepId: string }, _onTrace: (id: string) => void, callback: () => T): T {
              if (mode === "before") throw new Error("Recording failed before dispatch");
              if (mode === "skip") return undefined as T;
              if (mode === "mutate-link") link.stepId = "wrong-step";
              const result = callback();
              if (mode === "after") throw new Error("Recording failed after dispatch");
              if (mode === "reject") return Promise.reject(new Error("Recording rejected")) as T;
              if (mode === "replace") return Promise.resolve(triageBody("other")) as T;
              return result;
            },
          };
        },
      };
      const comparison = await api.compareWithFixture(refundFlow(), {}, refundFixture(), {
        client: liveClient(refundLive(triageBody("refund"), reviewBody(0.92, 0.2), calls)),
        devtools,
      });
      assert.deepEqual(calls, ["triage", "review"], "each live request executes exactly once");
      assert.deepEqual(comparison.outcome, { recorded: "approve", live: "approve", changed: false });
      assert.deepEqual(comparison.decisions, [
        { stepId: "refund-request", recorded: true, live: true, changed: false },
        { stepId: "approval", recorded: true, live: true, changed: false },
      ]);
      assert.deepEqual(comparison.steps, { onlyRecorded: [], onlyLive: [] });
      assert.deepEqual(norm(comparison.answers.filter((a) => a.stepId === "review")), norm([
        noulChange("review", "eligible", 0.94, 0.92, true),
        noulChange("review", "risky", 0.1, 0.2, true),
      ]));
      assert.deepEqual(comparison.liveFixture, {
        version: 1,
        flow: "refund",
        steps: { triage: triageBody("refund"), review: reviewBody(0.92, 0.2) },
      });
    });
  }
});

test("late observer response mutation cannot hide answer drift or rewrite the live fixture", async () => {
  const flow = defineJevFlow<null>("retained-response", (f) => {
    f.jev("ask", { state: "sample", questions: { score: noul("Score?") } });
    return f.output("done");
  });
  let retained: ReturnType<typeof noulBody> | undefined;
  let mutations = 0;
  let calls = 0;
  const comparison = await compareWithFixture(flow, null, {
    version: 1,
    flow: "retained-response",
    steps: { ask: noulBody("score", 0.1) },
  }, {
    client: liveClient(async () => {
      calls++;
      return Response.json(noulBody("score", 0.9));
    }),
    devtools: {
      startFlow: () => ({
        request(_link, _onTrace, callback) {
          const result = callback();
          void Promise.resolve(result).then((body) => {
            retained = body as ReturnType<typeof noulBody>;
          });
          return result;
        },
        update(run) {
          if (run.status === "success" && retained) {
            retained.answers.score.noul = 0.1;
            mutations++;
          }
        },
      }),
    },
  });
  assert.equal(calls, 1);
  assert.equal(mutations, 1, "the observer mutated the actual response after execution");
  assert.equal(comparison.changed, false, "only the answer differs");
  assert.deepEqual(comparison.answers, [noulChange("ask", "score", 0.1, 0.9, true)]);
  assert.equal(formatComparison(comparison), "ask.score.noul: 0.10 -> 0.90 (+0.80)");
  assert.deepEqual(comparison.liveFixture.steps, { ask: noulBody("score", 0.9) });
});

test("liveFixture holds the live responses, round-trips through JSON and replays to the live outcome", async () => {
  const api = await compareApi();
  const comparison = await api.compareWithFixture(escalationFlow(), { text: "t" }, escalationFixture, {
    client: liveClient(stepTransport(escalationLive)),
  });
  const saved = JSON.parse(JSON.stringify(comparison.liveFixture)) as FlowFixture;
  assert.deepEqual(saved, {
    version: 1,
    flow: "escalation",
    steps: { screen: noulBody("risk", 0.7), "deep-check": noulBody("thorough", 0.9) },
  });
  const { result, network } = await offline(() =>
    escalationFlow().run({ text: "t" }, { client: replayClient(saved) }),
  );
  assert.deepEqual(
    { outcome: result.outcome, value: result.value },
    { outcome: "deep", value: { risk: 0.7, thorough: 0.9 } },
  );
  assert.equal(network, 0);
});

// ---- 10. Report format ------------------------------------------------------------------
test("formatComparison lists each change on its own plain line", async () => {
  const api = await compareApi();
  const escalation = await api.compareWithFixture(escalationFlow(), { text: "t" }, escalationFixture, {
    client: liveClient(stepTransport(escalationLive)),
  });
  assert.equal(api.formatComparison(escalation), [
    "outcome: fast -> deep",
    'value: {"risk":0.3} -> {"risk":0.7,"thorough":0.9}',
    "decision route: then -> else",
    "step fast-check: recorded only",
    "step deep-check: live only",
    "screen.risk.noul: 0.30 -> 0.70 (+0.40)",
  ].join("\n"));
  const approval = await api.compareWithFixture(
    refundFlow(),
    { category: "refund", eligible: 0.94, risky: 0.1 },
    refundFixture(),
    { client: liveClient(refundLive(triageBody("refund"), reviewBody(0.85, 0.1))) },
  );
  assert.equal(api.formatComparison(approval), [
    "outcome: approve -> manual",
    'value: {"eligibility":0.94,"category":"refund"} -> (none)',
    "decision approval: then -> else",
    "review.eligible.noul: 0.94 -> 0.85 (-0.09)",
  ].join("\n"));
});

// ---- 11. Offline recorded side ----------------------------------------------------------
test("the recorded side makes no network calls; only the live client's own fetch is used", async () => {
  const api = await compareApi();
  const calls: string[] = [];
  const { result, network } = await offline(() =>
    api
      .compareWithFixture(refundFlow(), { category: "refund", eligible: 0.94, risky: 0.1 }, refundFixture(), {
        client: liveClient(refundLive(triageBody("refund"), reviewBody(0.85, 0.1), calls)),
      })
      .then((c) => ({ outcome: c.outcome }), (e: Error) => ({ error: e.message })),
  );
  assert.equal(network, 0, "global fetch was used");
  assert.deepEqual(calls, ["triage", "review"], "the live client ran each live step once");
  assert.deepEqual(result, { outcome: { recorded: "approve", live: "manual", changed: true } });
});
