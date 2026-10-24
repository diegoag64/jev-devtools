import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  TypeSafeClient,
  choice,
  noul,
  image,
  type Fetch,
} from "@typesafe-ai/sdk";
import { defineJevFlow, all } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import type { Trace } from "../src/protocol.js";
import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";

// Replay fixtures gate. The API under test is loaded dynamically so that, before the
// feature lands, each replay check fails on an explicit "must export" assertion and the
// stay-on checks (existing behaviour) still run.
type FlowFixture = {
  version: 1;
  flow: string;
  steps: Record<string, unknown>;
};
type BuiltFixture = {
  fixture: FlowFixture;
  missing: string[];
  warnings: string[];
};
type ReplayApi = {
  replayClient: (fixture: FlowFixture) => TypeSafeClient;
  flowFixture: (
    definition: FlowDefinition,
    run: FlowRun,
    traces: ReadonlyMap<string, Trace>,
  ) => BuiltFixture;
};
async function replayApi(): Promise<ReplayApi> {
  // Cast: these exports do not exist until the feature is built; the typeof checks are the gate.
  const flow = (await import("../flow/index.js")) as unknown as Partial<ReplayApi>;
  const main = (await import("../src/index.js")) as unknown as Partial<ReplayApi>;
  assert.equal(
    typeof flow.replayClient,
    "function",
    "jev-devtools/flow must export replayClient",
  );
  assert.equal(
    typeof main.flowFixture,
    "function",
    "jev-devtools must export flowFixture",
  );
  return { replayClient: flow.replayClient!, flowFixture: main.flowFixture! };
}

const origin = "http://localhost:5199";
const options = (fetch: Fetch) => ({
  apiKey: "sample-only",
  fetch,
  logLevel: "off" as const,
  retry: { maxRetries: 0 },
});
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
          when: all(
            review.answer("eligible").noul.gte(0.9),
            review.answer("risky").noul.lt(0.2),
          ),
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
const triageBody = (category: string) => ({
  model: "sample",
  answers: {
    category: {
      type: "choice",
      choice: category,
      confidence: 0.8,
      probabilities: { refund: 0.8, other: 0.2 },
    },
  },
});
const reviewBody = (eligible: number, risky: number) => ({
  model: "sample",
  answers: {
    eligible: { type: "noul", noul: eligible },
    risky: { type: "noul", noul: risky },
  },
});
function refundTransport(bodies: string[] = []): Fetch {
  return async (_url, init) => {
    bodies.push(String(init?.body));
    const request = JSON.parse(String(init?.body));
    const state = request.state.ticket ?? request.state;
    return Response.json(
      request.questions.category
        ? triageBody(state.category)
        : reviewBody(state.eligible, state.risky),
    );
  };
}

/**
 * Parallel lanes + join. The "photo" lane carries an image asset, so the SDK awaits asset
 * encoding before its fetch: live fetch order is risk, photo, eligibility, combined, which
 * differs from both definition order and fixture key order.
 */
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
const parallelAnswers: Record<string, number> = {
  photo: 0.7,
  eligibility: 0.95,
  risk: 0.05,
};
const parallelTransport: Fetch = async (_url, init) => {
  // Image requests are multipart; every other request is JSON with a `step` marker.
  const step =
    typeof init?.body === "string" ? JSON.parse(init.body).state.step : "photo";
  return Response.json(
    step === "combined"
      ? { model: "sample", answers: { ready: { type: "noul", noul: 0.97 } } }
      : { model: "sample", answers: { p: { type: "noul", noul: parallelAnswers[step] } } },
  );
};

/** Input-only branch: replay answers come from the fixture, so only input can change the route. */
function tieredFlow() {
  return defineJevFlow<{ tier: "vip" | "standard" }>("tiered", (flow) =>
    flow.branch("tier", {
      when: flow.input.get("tier").eq("vip"),
      then: (path) => {
        // Answer intentionally unused: an empty fallback response would let the run succeed.
        path.jev("vip-check", { state: flow.input, questions: { ok: noul("OK?") } });
        return path.output("vip");
      },
      else: (path) => {
        const check = path.jev("standard-check", {
          state: flow.input,
          questions: { ok: noul("OK?") },
        });
        return path.output("standard", { ok: check.answer("ok").noul });
      },
    }),
  );
}
const tieredTransport: Fetch = async () =>
  Response.json({ model: "sample", answers: { ok: { type: "noul", noul: 0.88 } } });

// ---- Helpers ----------------------------------------------------------------
async function history(
  inspector: ReturnType<typeof createJevDevtools>,
  path = "/flows/events",
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
  definition: FlowDefinition;
  run: FlowRun;
  traces: Map<string, Trace>;
};
async function captured(
  inspector: ReturnType<typeof createJevDevtools>,
  runId: string,
): Promise<Captured> {
  await delay(5); // Trace results are captured from a response clone after the step resolves.
  const flows = (await history(inspector)) as FlowUpdate;
  const run = flows.upserts.find((r) => r.id === runId);
  assert.ok(run, "captured run is retained");
  const definition = flows.definitions.find((d) => d.id === run.definitionId);
  assert.ok(definition, "captured definition is retained");
  const traces = (await history(inspector, "/events")).traces as Trace[];
  return { definition, run, traces: new Map(traces.map((t) => [t.id, t])) };
}
type Settled = { outcome: string; value?: unknown } | { error: string };
/** Rejections (and synchronous throws) become data so a wrong replay fails on the comparison. */
async function settle(
  pending: () => Promise<{ outcome: string; value?: unknown }>,
): Promise<Settled> {
  try {
    const { outcome, value } = await pending();
    return value === undefined ? { outcome } : { outcome, value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
/** No network and no API key: global fetch counts and throws; TYPESAFE_API_KEY is unset. */
async function offline<T>(body: () => Promise<T>): Promise<{ result: T; network: number }> {
  const realFetch = globalThis.fetch;
  const key = process.env.TYPESAFE_API_KEY;
  let network = 0;
  globalThis.fetch = (async () => {
    network++;
    throw new Error("network forbidden during replay");
  }) as typeof fetch;
  delete process.env.TYPESAFE_API_KEY;
  try {
    return { result: await body(), network };
  } finally {
    globalThis.fetch = realFetch;
    if (key !== undefined) process.env.TYPESAFE_API_KEY = key;
  }
}
const stepFacts = (run: FlowRun) =>
  Object.fromEntries(
    Object.values(run.steps).map((s) => [
      s.id,
      { status: s.status, decision: s.decision },
    ]),
  );
type AnyFlow = {
  run(
    input: never,
    options: Parameters<ReturnType<typeof refundFlow>["run"]>[1],
  ): Promise<{ runId: string; outcome: string; value?: unknown }>;
};
/** Live capture through an enabled inspector, then fixture build. */
async function liveCapture(flow: AnyFlow, input: unknown, fetch: Fetch, limit?: number) {
  const inspector = createJevDevtools({ origin, enabled: true, limit });
  try {
    const client = inspector.createClient(options(fetch), { source: "sample" });
    const live = await settle(() => flow.run(input as never, { client, devtools: inspector }));
    const runId = (await history(inspector)).upserts[0]?.id as string;
    return { live, ...(await captured(inspector, runId)) };
  } finally {
    inspector.dispose();
  }
}
/** Replay with an inspector attached (plain replay client, no request capture) to read decisions. */
async function replayFacts(flow: AnyFlow, input: unknown, client: () => TypeSafeClient) {
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const result = await settle(() => flow.run(input as never, { client: client(), devtools: inspector }));
    const run = (await history(inspector)).upserts[0] as FlowRun;
    return { result, facts: stepFacts(run) };
  } finally {
    inspector.dispose();
  }
}

// ---- Round trip -------------------------------------------------------------
test("round trip: captured runs replay offline with the same outcome, value and decisions", async () => {
  const api = await replayApi();
  const cases: [string, AnyFlow, unknown, Fetch, Settled][] = [
    ["approve", refundFlow(), { category: "refund", eligible: 0.94, risky: 0.1 }, refundTransport(),
      { outcome: "approve", value: { eligibility: 0.94, category: "refund" } }],
    ["manual (nested else)", refundFlow(), { category: "refund", eligible: 0.5, risky: 0.1 }, refundTransport(),
      { outcome: "manual" }],
    ["other (outer else)", refundFlow(), { category: "other", eligible: 0.94, risky: 0.1 }, refundTransport(),
      { outcome: "other" }],
    ["parallel + join", parallelFlow(), { ticket: "duplicate charge" }, parallelTransport,
      { outcome: "ready", value: { eligibility: 0.95, risk: 0.05, readiness: 0.97 } }],
    ["input branch", tieredFlow(), { tier: "standard" }, tieredTransport,
      { outcome: "standard", value: { ok: 0.88 } }],
  ];
  for (const [name, flow, input, fetch, expected] of cases) {
    const cap = await liveCapture(flow, input, fetch);
    assert.deepEqual(cap.live, expected, `${name}: live premise`);
    const built = api.flowFixture(cap.definition, cap.run, cap.traces);
    assert.deepEqual(built.missing, [], `${name}: nothing missing`);
    assert.deepEqual(built.warnings, [], `${name}: no capture warnings`);
    const fixture = JSON.parse(JSON.stringify(built.fixture)) as FlowFixture;
    const { result, network } = await offline(() =>
      settle(() => flow.run(input as never, { client: api.replayClient(fixture) })),
    );
    assert.deepEqual(result, expected, `${name}: replay outcome and value`);
    assert.equal(network, 0, `${name}: replay made network calls`);
    const replayed = await offline(() =>
      replayFacts(flow, input, () => api.replayClient(fixture)),
    );
    assert.deepEqual(replayed.result.result, expected, `${name}: observed replay`);
    assert.deepEqual(replayed.result.facts, stepFacts(cap.run), `${name}: same statuses and decisions`);
    assert.equal(replayed.network, 0, `${name}: observed replay made network calls`);
  }
});

test("flowFixture persists exactly the recorded response bodies of completed jev steps", async () => {
  const api = await replayApi();
  const approve = await liveCapture(refundFlow(), { category: "refund", eligible: 0.94, risky: 0.1 }, refundTransport());
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.flowFixture(approve.definition, approve.run, approve.traces).fixture)),
    {
      version: 1,
      flow: "refund",
      steps: { triage: triageBody("refund"), review: reviewBody(0.94, 0.1) },
    },
  );
  // Untaken jev steps and branch/output nodes are not fixture entries and are not "missing".
  const other = await liveCapture(refundFlow(), { category: "other", eligible: 0.94, risky: 0.1 }, refundTransport());
  assert.equal(other.run.steps.review.status, "untaken", "premise: review untaken");
  const built = api.flowFixture(other.definition, other.run, other.traces);
  assert.deepEqual(
    { steps: built.fixture.steps, missing: built.missing },
    { steps: { triage: triageBody("other") }, missing: [] },
  );
});

test("flowFixture ignores errored and blocked steps after a failure", async () => {
  const api = await replayApi();
  const flow = defineJevFlow("failing", (f) => {
    f.jev("first", { state: { step: "first" }, questions: reviewQ });
    f.jev("broken", { state: { step: "broken" }, questions: reviewQ });
    f.jev("after", { state: { step: "after" }, questions: reviewQ });
    return f.output("done");
  });
  const cap = await liveCapture(flow, {}, async (_url, init) =>
    JSON.parse(String(init?.body)).state.step === "broken"
      ? Response.json({ error: { message: "bad" } }, { status: 400 })
      : Response.json(reviewBody(0.9, 0.1)),
  );
  assert.deepEqual(
    [cap.run.steps.first.status, cap.run.steps.broken.status, cap.run.steps.after.status, cap.run.steps.done.status],
    ["completed", "error", "blocked", "blocked"],
    "premise: failure blocks the rest",
  );
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  assert.deepEqual(
    { steps: built.fixture.steps, missing: built.missing },
    { steps: { first: reviewBody(0.9, 0.1) }, missing: [] },
  );
});

// ---- Missing captures and warnings -------------------------------------------
test("flowFixture reports missing for an evicted trace, an unlinked step and a trace without a result", async () => {
  const api = await replayApi();
  const input = { category: "refund", eligible: 0.94, risky: 0.1 } as const;
  // Evicted: request history limit 1 keeps only the review trace.
  const evicted = await liveCapture(refundFlow(), input, refundTransport(), 1);
  assert.ok(evicted.run.steps.triage.traceId, "premise: triage was linked");
  assert.equal(evicted.traces.has(evicted.run.steps.triage.traceId!), false, "premise: triage trace evicted");
  const e = api.flowFixture(evicted.definition, evicted.run, evicted.traces);
  assert.deepEqual(
    { steps: e.fixture.steps, missing: e.missing },
    { steps: { review: reviewBody(0.94, 0.1) }, missing: ["triage"] },
  );
  // Unlinked: a plain client with devtools records the run but no request captures.
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const result = await refundFlow().run(input, {
      client: new TypeSafeClient(options(refundTransport())),
      devtools: inspector,
    });
    const unlinked = await captured(inspector, result.runId);
    assert.equal(unlinked.run.steps.review.status, "completed", "premise: review completed");
    assert.equal(unlinked.run.steps.review.traceId, undefined, "premise: no trace link");
    const u = api.flowFixture(unlinked.definition, unlinked.run, unlinked.traces);
    assert.deepEqual(
      { steps: u.fixture.steps, missing: [...u.missing].sort() },
      { steps: {}, missing: ["review", "triage"] },
    );
  } finally {
    inspector.dispose();
  }
  // No result: a 2xx non-JSON body completes the step (its answer is unused) but the
  // recorder cannot capture a result from it.
  const ack = defineJevFlow("ack", (f) => {
    f.jev("notify", { state: { step: "notify" }, questions: reviewQ });
    const r = f.jev("decide", { state: { step: "decide" }, questions: reviewQ });
    return f.output("done", { eligible: r.answer("eligible").noul });
  });
  const cap = await liveCapture(ack, {}, async (_url, init) =>
    JSON.parse(String(init?.body)).state.step === "notify"
      ? new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })
      : Response.json(reviewBody(0.6, 0.1)),
  );
  const notifyTrace = cap.traces.get(cap.run.steps.notify.traceId ?? "");
  assert.deepEqual(
    [cap.run.steps.notify.status, !!notifyTrace, notifyTrace?.result],
    ["completed", true, undefined],
    "premise: completed step whose retained trace has no result",
  );
  const n = api.flowFixture(cap.definition, cap.run, cap.traces);
  assert.deepEqual(
    { steps: n.fixture.steps, missing: n.missing },
    { steps: { decide: reviewBody(0.6, 0.1) }, missing: ["notify"] },
  );
});

test("flowFixture carries de-duplicated capture warnings from truncated captures", async () => {
  const api = await replayApi();
  const long = "x".repeat(20_000);
  const flow = defineJevFlow<{ text: string }>("long", (f) => {
    f.jev("first", { state: f.input, questions: reviewQ });
    f.jev("second", { state: f.input, questions: reviewQ });
    return f.output("done");
  });
  const cap = await liveCapture(flow, { text: long }, async () => Response.json(reviewBody(0.5, 0.5)));
  assert.equal(
    [...cap.traces.values()].filter((t) => t.captureWarnings.includes("Long text truncated in capture.")).length,
    2,
    "premise: both captures truncated",
  );
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  assert.deepEqual(built.warnings, ["Long text truncated in capture."]);
  assert.deepEqual(Object.keys(built.fixture.steps).sort(), ["first", "second"]);
  // Warnings come only from the traces the fixture uses, not every trace in the map.
  const clean = await liveCapture(refundFlow(), { category: "other", eligible: 0, risky: 0 }, refundTransport());
  const merged = new Map([...cap.traces, ...clean.traces]);
  assert.deepEqual(api.flowFixture(clean.definition, clean.run, merged).warnings, []);
});

// ---- Replay semantics -----------------------------------------------------------
test("a route the capture did not take rejects naming the missing step, with no network", async () => {
  const api = await replayApi();
  const cap = await liveCapture(tieredFlow(), { tier: "standard" }, tieredTransport);
  const fixture = JSON.parse(
    JSON.stringify(api.flowFixture(cap.definition, cap.run, cap.traces).fixture),
  ) as FlowFixture;
  assert.deepEqual(Object.keys(fixture.steps), ["standard-check"], "premise");
  const { result, network } = await offline(() =>
    settle(() => tieredFlow().run({ tier: "vip" }, { client: api.replayClient(fixture) })),
  );
  assert.ok("error" in result, `replay of an uncaptured route must reject, got ${JSON.stringify(result)}`);
  assert.match(result.error, /vip-check/);
  assert.equal(network, 0);
});

test("a call outside a flow run rejects, including after a flow run finished on the same client", async () => {
  const api = await replayApi();
  const fixture: FlowFixture = {
    version: 1,
    flow: "tiered",
    steps: { "standard-check": { model: "hand", answers: { ok: { type: "noul", noul: 0.5 } } } },
  };
  const { result, network } = await offline(async () => {
    const client = api.replayClient(fixture);
    const direct = await settle(
      () => client.systemOne({ state: "x", questions: { ok: noul("OK?") } }).then(() => ({ outcome: "resolved" })),
    );
    const inFlow = await settle(() => tieredFlow().run({ tier: "standard" }, { client }));
    const after = await settle(
      () => client.systemOne({ state: "x", questions: { ok: noul("OK?") } }).then(() => ({ outcome: "resolved" })),
    );
    return { direct, inFlow, after, real: client instanceof TypeSafeClient };
  });
  assert.equal(result.real, true, "replayClient returns a real TypeSafeClient");
  for (const outside of [result.direct, result.after]) {
    assert.ok("error" in outside, `outside call must reject, got ${JSON.stringify(outside)}`);
    assert.match(outside.error, /outside/i);
    assert.match(outside.error, /flow/i);
  }
  assert.deepEqual(result.inFlow, { outcome: "standard", value: { ok: 0.5 } });
  assert.equal(network, 0);
});

test("a hand-written fixture mocks Jev by step id, in any key order", async () => {
  const api = await replayApi();
  const fixture: FlowFixture = {
    version: 1,
    flow: "refund",
    steps: {
      review: {
        model: "hand",
        answers: { eligible: { type: "noul", noul: 0.99 }, risky: { type: "noul", noul: 0.01 } },
      },
      triage: {
        model: "hand",
        answers: {
          category: { type: "choice", choice: "refund", confidence: 1, probabilities: { refund: 1, other: 0 } },
        },
      },
    },
  };
  // Input disagrees with the fixture on purpose: answers come from the fixture.
  const { result, network } = await offline(() =>
    settle(() => refundFlow().run({ category: "other", eligible: 0, risky: 1 }, { client: api.replayClient(fixture) })),
  );
  assert.deepEqual(result, { outcome: "approve", value: { eligibility: 0.99, category: "refund" } });
  assert.equal(network, 0);
});

test("parallel lanes replay by step id when fixture key order differs from execution order", async () => {
  const api = await replayApi();
  const cap = await liveCapture(parallelFlow(), { ticket: "t" }, parallelTransport);
  const { steps } = JSON.parse(
    JSON.stringify(api.flowFixture(cap.definition, cap.run, cap.traces).fixture),
  ) as FlowFixture;
  // Reverse of execution order (risk, photo, eligibility, combined) and of definition order.
  const reordered: FlowFixture = {
    version: 1,
    flow: "parallel-review",
    steps: {
      combined: steps.combined,
      eligibility: steps.eligibility,
      photo: steps.photo,
      risk: steps.risk,
    },
  };
  const { result, network } = await offline(async () => {
    const client = api.replayClient(reordered);
    // Two concurrent runs on one client must not leak step identity into each other.
    return Promise.all([
      settle(() => parallelFlow().run({ ticket: "a" }, { client })),
      settle(() => parallelFlow().run({ ticket: "b" }, { client })),
    ]);
  });
  const expected = { outcome: "ready", value: { eligibility: 0.95, risk: 0.05, readiness: 0.97 } };
  assert.deepEqual(result, [expected, expected]);
  assert.equal(network, 0);
});

// ---- Stay-on: existing behaviour must not change ----------------------------------
test("stay-on: a normal fixture-fetch client runs exactly as before, with and without devtools", async () => {
  const input = { category: "refund", eligible: 0.94, risky: 0.1 } as const;
  // Golden request bodies recorded from the pre-feature runner (0.3.0, SDK 0.7.0).
  const golden = [
    '{"state":{"category":"refund","eligible":0.94,"risky":0.1},"questions":{"category":{"type":"choice","instructions":"Category?","criteria":{"refund":null,"other":null}}},"model":"jev-latest"}',
    '{"state":{"ticket":{"category":"refund","eligible":0.94,"risky":0.1},"category":"refund"},"questions":{"eligible":{"type":"noul","instructions":"Eligible?"},"risky":{"type":"noul","instructions":"Risky?"}},"model":"jev-latest"}',
  ];
  const plainBodies: string[] = [];
  const plain = await refundFlow().run(input, {
    client: new TypeSafeClient(options(refundTransport(plainBodies))),
  });
  assert.deepEqual(
    { outcome: plain.outcome, value: plain.value, bodies: plainBodies },
    { outcome: "approve", value: { eligibility: 0.94, category: "refund" }, bodies: golden },
  );
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const bodies: string[] = [];
    const client = inspector.createClient(options(refundTransport(bodies)), { source: "sample" });
    const result = await refundFlow().run(input, { client, devtools: inspector });
    assert.deepEqual(
      { outcome: result.outcome, value: result.value, bodies },
      { outcome: "approve", value: { eligibility: 0.94, category: "refund" }, bodies: golden },
    );
    const cap = await captured(inspector, result.runId);
    assert.deepEqual(
      [...cap.traces.values()]
        .map((t) => ({
          stepId: t.flow?.stepId,
          linked:
            !!t.flow &&
            cap.run.steps[t.flow.stepId]?.traceId === t.id &&
            cap.run.steps[t.flow.stepId]?.executionId === t.flow.executionId &&
            t.flow.runId === result.runId,
          answers: t.result?.answers,
        }))
        .sort((a, b) => String(a.stepId).localeCompare(String(b.stepId))),
      [
        { stepId: "review", linked: true, answers: reviewBody(0.94, 0.1).answers },
        { stepId: "triage", linked: true, answers: triageBody("refund").answers },
      ],
    );
    assert.deepEqual(stepFacts(cap.run), {
      triage: { status: "completed", decision: undefined },
      "refund-request": { status: "completed", decision: true },
      review: { status: "completed", decision: undefined },
      approval: { status: "completed", decision: true },
      approve: { status: "completed", decision: undefined },
      manual: { status: "untaken", decision: undefined },
      other: { status: "untaken", decision: undefined },
    });
  } finally {
    inspector.dispose();
  }
  const parallel = await parallelFlow().run({ ticket: "t" }, {
    client: new TypeSafeClient(options(parallelTransport)),
  });
  assert.deepEqual(
    { outcome: parallel.outcome, value: parallel.value },
    { outcome: "ready", value: { eligibility: 0.95, risk: 0.05, readiness: 0.97 } },
  );
});
