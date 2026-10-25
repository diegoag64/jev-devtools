import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { TypeSafeClient, image, noul, type Fetch } from "@typesafe-ai/sdk";
import { defineJevFlow } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import type { Trace } from "../src/protocol.js";
import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";

// Replay fixtures gate, part 2: the 0.4.0 engine additions (task, request factories,
// if/merge, map, loop, loop containing map). Same loading pattern as replay.test.ts: the
// API is imported dynamically so every check fails on an explicit "must export" assertion
// until the feature lands.
//
// Fixture key scheme for item steps (established from flow/index.ts, not assumed): a jev
// step inside a map item or loop iteration is keyed by the id the engine already links its
// request trace to, `${parentStepId}/${index}/${innerStepId}`, composed once per nesting
// level (loop containing map: `${loopId}/${iteration}/${mapId}/${item}/${innerId}`). The
// item program's own run.steps use the bare inner id, which repeats across items and may
// equal a root step id, so it cannot key a fixture. fixture.flow is always the root flow's
// name; item programs are named "Item · <title or id>" / "Iteration · <title or id>".
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

const origin = "http://localhost:5197";
const options = (fetch: Fetch) => ({
  apiKey: "sample-only",
  fetch,
  logLevel: "off" as const,
  retry: { maxRetries: 0 },
});
const noulBody = (answers: Record<string, number>) => ({
  model: "sample",
  answers: Object.fromEntries(
    Object.entries(answers).map(([name, value]) => [
      name,
      { type: "noul", noul: value },
    ]),
  ),
});
/** JSON transport answering by the request's `state.step` marker. */
const transport =
  (answer: (state: Record<string, unknown>, questions: string[]) => unknown): Fetch =>
  async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json(answer(body.state, Object.keys(body.questions)));
  };

// ---- Helpers (same contract as replay.test.ts) --------------------------------
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
  await delay(10); // Trace results are captured from a response clone after the step resolves.
  const flows = (await history(inspector)) as FlowUpdate;
  const run = flows.upserts.find((r) => r.id === runId);
  assert.ok(run, "captured run is retained");
  const definition = flows.definitions.find((d) => d.id === run.definitionId);
  assert.ok(definition, "captured definition is retained");
  const traces = (await history(inspector, "/events")).traces as Trace[];
  return { definition, run, traces: new Map(traces.map((t) => [t.id, t])) };
}
type Settled = { outcome: string; value?: unknown } | { error: string };
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
type Facts = Record<
  string,
  {
    status: string;
    decision?: boolean;
    items?: { index: number; status: string; steps?: Facts }[];
  }
>;
/** Statuses and decisions, descending into map items and loop iterations. */
const facts = (run: FlowRun): Facts =>
  Object.fromEntries(
    Object.values(run.steps).map((s) => [
      s.id,
      {
        status: s.status,
        decision: s.decision,
        ...(s.collection
          ? {
              items: s.collection.items.map((item) => ({
                index: item.index,
                status: item.status,
                steps: item.run ? facts(item.run) : undefined,
              })),
            }
          : {}),
      },
    ]),
  );
type RunOptions = Parameters<ReturnType<typeof defineJevFlow<unknown>>["run"]>[1];
type AnyFlow = {
  definition: FlowDefinition;
  run(
    input: never,
    options: RunOptions,
  ): Promise<{ runId: string; outcome: string; value?: unknown }>;
};
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
/** Replay with an inspector attached (plain replay client, no request capture) to read facts. */
async function replayFacts(flow: AnyFlow, input: unknown, client: () => Pick<TypeSafeClient, "systemOne">) {
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const result = await settle(() => flow.run(input as never, { client: client(), devtools: inspector }));
    await delay(5);
    const run = (await history(inspector)).upserts[0] as FlowRun;
    return { result, facts: facts(run) };
  } finally {
    inspector.dispose();
  }
}
/** Records each SDK request the runner sends, then forwards it unchanged to the replay client. */
function spy(client: TypeSafeClient) {
  const states: unknown[] = [];
  const wrapped: Pick<TypeSafeClient, "systemOne"> = {
    systemOne: ((request: Parameters<TypeSafeClient["systemOne"]>[0], opts?: Parameters<TypeSafeClient["systemOne"]>[1]) => {
      states.push(structuredClone(request.state));
      return client.systemOne(request, opts);
    }) as TypeSafeClient["systemOne"],
  };
  return { client: wrapped, states };
}
/** The message names this exact id (not as part of a longer composed key). */
function assertNames(message: string, id: string, label = "error") {
  const escaped = id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  assert.match(message, new RegExp(`(^|[^\\w/])${escaped}([^\\w/]|$)`), `${label} names "${id}": ${message}`);
}
const roundTrip = (fixture: FlowFixture) =>
  JSON.parse(JSON.stringify(fixture)) as FlowFixture;
/** Every trace the fixture used is linked under exactly its fixture key. */
function assertKeysAreTraceLinks(cap: Captured, fixture: FlowFixture, label: string) {
  const links = [...cap.traces.values()].map((t) => [t.flow?.stepId, t.result]);
  assert.deepEqual(
    Object.fromEntries(links),
    fixture.steps,
    `${label}: fixture keys are the inspector's trace link step ids, each with that trace's result`,
  );
  for (const trace of cap.traces.values())
    assert.equal(trace.flow?.runId, cap.run.id, `${label}: item traces link to the root run`);
}

// ---- Flows under test -----------------------------------------------------------
function taskedFlow(runs: string[]) {
  return defineJevFlow<{ text: string; n: number }>("tasked", (f) => {
    const normalized = f.task("normalize", {
      input: f.input,
      run: ({ text, n }) => {
        runs.push("normalize");
        return { topic: text.toUpperCase(), weight: n * 2 };
      },
    });
    const classify = f.jev("classify", {
      state: { step: "classify", normalized },
      questions: { ok: noul("OK?") },
    });
    const score = f.task("score", {
      input: { ok: classify.answer("ok").noul, weight: normalized.get("weight") },
      run: ({ ok, weight }) => {
        runs.push("score");
        return ok * weight;
      },
    });
    return f.output("done", { score, topic: normalized.get("topic") });
  });
}

function dynamicFlow() {
  return defineJevFlow<{ topic: string }>("dynamic", (f) => {
    const probe = f.jev("probe", {
      input: { topic: f.input.get("topic") },
      request: ({ topic }) => ({
        state: { step: "probe", topic },
        questions: { [`about_${topic}`]: noul("About?") },
      }),
    });
    const picked = f.task("pick", {
      input: probe.answers,
      run: (answers) =>
        Object.entries(answers as Record<string, { noul: number }>).map(
          ([name, answer]) => ({ name, noul: answer.noul }),
        ),
    });
    return f.output("done", picked);
  });
}
const dynamicTransport = transport((_state, questions) =>
  noulBody(Object.fromEntries(questions.map((name) => [name, 0.625]))),
);

function gatedFlow() {
  return defineJevFlow<{ text: string }>("gated", (f) => {
    const triage = f.jev("triage", {
      state: { step: "triage", text: f.input.get("text") },
      questions: { urgent: noul("Urgent?") },
    });
    const level = f.if("urgency", {
      when: triage.answer("urgent").noul.gt(0.5),
      then: (p) =>
        p.jev("escalate", { state: { step: "escalate" }, questions: { level: noul("Level?") } })
          .answer("level").noul,
      else: (p) =>
        p.jev("defer", { state: { step: "defer" }, questions: { level: noul("Level?") } })
          .answer("level").noul,
    });
    const summary = f.jev("summarize", {
      state: { step: "summarize", level },
      questions: { done: noul("Done?") },
    });
    return f.output("done", { level, done: summary.answer("done").noul });
  });
}
const gatedTransport = transport((state) =>
  state.step === "triage"
    ? noulBody({ urgent: state.text === "fire" ? 0.9 : 0.1 })
    : state.step === "escalate"
      ? noulBody({ level: 0.75 })
      : state.step === "defer"
        ? noulBody({ level: 0.25 })
        : noulBody({ done: state.level as number }),
);

type BatchInput = { items: { text: string; delay: number }[] };
/** Root jev, a map whose items run a local task then a jev, and a root jev that reuses the item step id. */
function batchedFlow(concurrency = 3) {
  return defineJevFlow<BatchInput>("batched", (f) => {
    const plan = f.jev("plan", { state: { step: "plan" }, questions: { go: noul("Go?") } });
    const scores = f.map(
      "batch",
      {
        items: f.input.get("items"),
        input: { go: plan.answer("go").noul },
        concurrency,
        maxItems: 8,
      },
      (item) => {
        const text = item.task("wait", {
          input: item.input.get("item"),
          run: async (it) => {
            await delay(it.delay);
            return it.text;
          },
        });
        return item
          .jev("assess", {
            state: { step: "item", text, go: item.input.get("context").get("go") },
            questions: { yes: noul("Yes?") },
          })
          .answer("yes").noul;
      },
    );
    // Same id as the item step on purpose: inner ids are only unique per item program.
    const total = f.jev("assess", {
      state: { step: "total", scores },
      questions: { ok: noul("OK?") },
    });
    return f.output("done", { scores, ok: total.answer("ok").noul });
  });
}
const itemAnswers: Record<string, number> = { a: 0.125, b: 0.25, c: 0.5, d: 0.75 };
const batchedTransport = transport((state) =>
  state.step === "plan"
    ? noulBody({ go: 0.875 })
    : state.step === "item"
      ? noulBody({ yes: itemAnswers[state.text as string] })
      : noulBody({ ok: 0.375 }),
);
const batchInput = (delays: number[]): BatchInput => ({
  items: ["a", "b", "c", "d"].map((text, i) => ({ text, delay: delays[i] })),
});
/** Hand-checked golden fixture for batchedFlow, so replay checks do not depend on flowFixture. */
const batchedGolden = (): FlowFixture => ({
  version: 1,
  flow: "batched",
  steps: {
    plan: noulBody({ go: 0.875 }),
    "batch/0/assess": noulBody({ yes: 0.125 }),
    "batch/1/assess": noulBody({ yes: 0.25 }),
    "batch/2/assess": noulBody({ yes: 0.5 }),
    "batch/3/assess": noulBody({ yes: 0.75 }),
    assess: noulBody({ ok: 0.375 }),
  },
});
const batchedExpected = {
  outcome: "done",
  value: { scores: [0.125, 0.25, 0.5, 0.75], ok: 0.375 },
};

/** Loop whose stop depends on answers: total < 0.8 with gains 0.25, 0.5, 0.125 runs 3 iterations. */
function refineFlow() {
  return defineJevFlow<null>("refine", (f) => {
    const final = f.loop(
      "rounds",
      {
        initial: { n: 0, total: 0 },
        input: null,
        while: (s) => s.get("total").lt(0.8),
        maxIterations: 5,
      },
      (it) => {
        const ask = it.jev("ask", {
          state: { step: "ask", n: it.input.get("state").get("n") },
          questions: { gain: noul("Gain?") },
        });
        return it.task("next", {
          input: { s: it.input.get("state"), g: ask.answer("gain").noul },
          run: ({ s, g }) => ({ n: s.n + 1, total: s.total + g }),
        });
      },
    );
    return f.output("done", final);
  });
}
const gains = [0.25, 0.5, 0.125];
const refineTransport = transport((state) => noulBody({ gain: gains[state.n as number] }));

/** Loop containing a map: two iterations of two items each. */
function sweepFlow() {
  return defineJevFlow<{ items: number[] }>("sweep", (f) => {
    const final = f.loop(
      "rounds",
      {
        initial: { n: 0, seen: [] as number[] },
        input: { items: f.input.get("items") },
        while: (s) => s.get("n").lt(2),
        maxIterations: 3,
      },
      (it) => {
        const scores = it.map(
          "batch",
          {
            items: it.input.get("context").get("items"),
            input: { n: it.input.get("state").get("n") },
            concurrency: 2,
            maxItems: 4,
          },
          (item) =>
            item
              .jev("assess", {
                state: {
                  step: "sweep",
                  n: item.input.get("context").get("n"),
                  item: item.input.get("item"),
                },
                questions: { yes: noul("Yes?") },
              })
              .answer("yes").noul,
        );
        return it.task("next", {
          input: { s: it.input.get("state"), scores },
          run: ({ s, scores }) => ({ n: s.n + 1, seen: [...s.seen, ...scores] }),
        });
      },
    );
    return f.output("done", final);
  });
}
const sweepAnswers: Record<string, number> = { "0:1": 0.125, "0:2": 0.25, "1:1": 0.5, "1:2": 0.75 };
const sweepTransport = transport((state) =>
  noulBody({ yes: sweepAnswers[`${state.n}:${state.item}`] }),
);
const sweepExpected = { outcome: "done", value: { n: 2, seen: [0.125, 0.25, 0.5, 0.75] } };

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
  "base64",
);
/**
 * Items whose state carries an image asset: the SDK awaits asset encoding before its fetch,
 * so concurrent items' fetches run after every item has started. Step identity must follow
 * each call's own async context, not whichever item started last.
 */
function picturesFlow() {
  return defineJevFlow<{ items: number[] }>("pictures", (f) =>
    f.output(
      "done",
      f.map(
        "shots",
        { items: f.input.get("items"), input: null, concurrency: 3, maxItems: 4 },
        (item) =>
          item
            .jev("look", {
              state: { i: item.input.get("item"), photo: image(png) },
              questions: { p: noul("P?") },
            })
            .answer("p").noul,
      ),
    ),
  );
}
const pictureAnswers = [0.125, 0.25, 0.5];
/** Multipart body: the JSON request part carries the item number. */
const picturesTransport: Fetch = async (_url, init) => {
  const text = await (init?.body as Blob).text();
  const i = Number(/"i":(\d+)/.exec(text)?.[1]);
  return Response.json(noulBody({ p: pictureAnswers[i] }));
};

/** Map-only flow (no root jev step), so only item calls can check the flow name. */
function namedRootFlow() {
  return defineJevFlow<{ items: number[] }>("named-root", (f) =>
    f.output(
      "done",
      f.map(
        "batch",
        { items: f.input.get("items"), input: null, concurrency: 1, maxItems: 4 },
        (item) =>
          item
            .jev("assess", {
              state: { step: "named", item: item.input.get("item") },
              questions: { yes: noul("Yes?") },
            })
            .answer("yes").noul,
        { title: "Batch" },
      ),
    ),
  );
}
const namedTransport = transport((state) => noulBody({ yes: (state.item as number) / 8 }));

// ---- Tasks ------------------------------------------------------------------------
test("task steps run locally on replay, are not fixture entries, and their outputs feed later jev requests", async () => {
  const api = await replayApi();
  const liveRuns: string[] = [];
  const cap = await liveCapture(taskedFlow(liveRuns), { text: "hello", n: 3 },
    transport(() => noulBody({ ok: 0.5 })));
  assert.deepEqual(cap.live, { outcome: "done", value: { score: 3, topic: "HELLO" } }, "live premise");
  assert.deepEqual(liveRuns, ["normalize", "score"], "live premise: tasks ran");
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  assert.deepEqual(
    { fixture: roundTrip(built.fixture), missing: built.missing, warnings: built.warnings },
    { fixture: { version: 1, flow: "tasked", steps: { classify: noulBody({ ok: 0.5 }) } }, missing: [], warnings: [] },
    "only the jev step is a fixture entry; tasks are neither entries nor missing",
  );
  const fixture = roundTrip(built.fixture);
  for (const [input, expected, normalized] of [
    [{ text: "hello", n: 3 }, { score: 3, topic: "HELLO" }, { topic: "HELLO", weight: 6 }],
    // Different input: task outputs are computed now, not read from the capture.
    [{ text: "bye", n: 5 }, { score: 5, topic: "BYE" }, { topic: "BYE", weight: 10 }],
  ] as const) {
    const runs: string[] = [];
    const s = spy(api.replayClient(fixture));
    const { result, network } = await offline(() =>
      settle(() => taskedFlow(runs).run(input, { client: s.client })),
    );
    assert.deepEqual(result, { outcome: "done", value: expected }, `${input.text}: replay outcome`);
    assert.deepEqual(runs, ["normalize", "score"], `${input.text}: tasks ran locally on replay`);
    assert.deepEqual(s.states, [{ step: "classify", normalized }], `${input.text}: task output fed the jev request`);
    assert.equal(network, 0);
  }
  const observed = await offline(() =>
    replayFacts(taskedFlow([]), { text: "hello", n: 3 }, () => api.replayClient(fixture)),
  );
  assert.deepEqual(observed.result.facts, facts(cap.run), "same step statuses");
  assert.equal(observed.network, 0);
});

// ---- Runtime request factories ------------------------------------------------------
test("runtime request factories: generated question names replay, and a missing generated answer rejects by name", async () => {
  const api = await replayApi();
  const cap = await liveCapture(dynamicFlow(), { topic: "refund" }, dynamicTransport);
  const expected = { outcome: "done", value: [{ name: "about_refund", noul: 0.625 }] };
  assert.deepEqual(cap.live, expected, "live premise");
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  assert.deepEqual(
    { fixture: roundTrip(built.fixture), missing: built.missing },
    { fixture: { version: 1, flow: "dynamic", steps: { probe: noulBody({ about_refund: 0.625 }) } }, missing: [] },
  );
  const fixture = roundTrip(built.fixture);
  const same = await offline(() =>
    settle(() => dynamicFlow().run({ topic: "refund" }, { client: api.replayClient(fixture) })),
  );
  assert.deepEqual(same.result, expected, "generated names replay");
  assert.equal(same.network, 0);
  // A different input generates a question the fixture never answered.
  const other = await offline(() =>
    settle(() => dynamicFlow().run({ topic: "billing" }, { client: api.replayClient(fixture) })),
  );
  assert.ok("error" in other.result, `missing generated answer must reject, got ${JSON.stringify(other.result)}`);
  assert.match(other.result.error, /about_billing/);
  assert.match(other.result.error, /probe/);
  assert.doesNotMatch(other.result.error, /about_refund/, "names the absent answer, not the recorded one");
  assert.equal(other.network, 0);
});

// ---- if() with merge ------------------------------------------------------------------
test("if() with merge: each route replays, the merge feeds later requests, and an unrecorded arm rejects", async () => {
  const api = await replayApi();
  for (const [text, arm, level] of [["fire", "escalate", 0.75], ["drizzle", "defer", 0.25]] as const) {
    const cap = await liveCapture(gatedFlow(), { text }, gatedTransport);
    const expected = { outcome: "done", value: { level, done: level } };
    assert.deepEqual(cap.live, expected, `${arm}: live premise`);
    assert.equal(cap.run.steps["urgency-result"]?.status, "completed", `${arm}: premise merge node`);
    const built = api.flowFixture(cap.definition, cap.run, cap.traces);
    assert.deepEqual(
      { fixture: roundTrip(built.fixture), missing: built.missing },
      {
        fixture: {
          version: 1,
          flow: "gated",
          steps: {
            triage: noulBody({ urgent: text === "fire" ? 0.9 : 0.1 }),
            [arm]: noulBody({ level }),
            summarize: noulBody({ done: level }),
          },
        },
        missing: [],
      },
      `${arm}: arm jev steps are entries; if/merge nodes are neither entries nor missing`,
    );
    const fixture = roundTrip(built.fixture);
    const s = spy(api.replayClient(fixture));
    // Input disagrees on purpose: the route comes from the fixture's triage answer.
    const { result, network } = await offline(() =>
      settle(() => gatedFlow().run({ text: "other" }, { client: s.client })),
    );
    assert.deepEqual(result, expected, `${arm}: replay outcome`);
    assert.deepEqual(s.states.at(-1), { step: "summarize", level }, `${arm}: merged value fed summarize`);
    assert.equal(network, 0);
    const observed = await offline(() =>
      replayFacts(gatedFlow(), { text }, () => api.replayClient(fixture)),
    );
    assert.deepEqual(observed.result.facts, facts(cap.run), `${arm}: same statuses and decisions, merge included`);
  }
  // A fixture whose triage answer now takes the other arm has no entry for that arm.
  const cap = await liveCapture(gatedFlow(), { text: "fire" }, gatedTransport);
  const flipped = roundTrip(api.flowFixture(cap.definition, cap.run, cap.traces).fixture);
  flipped.steps.triage = noulBody({ urgent: 0.1 });
  const { result } = await offline(() =>
    settle(() => gatedFlow().run({ text: "fire" }, { client: api.replayClient(flipped) })),
  );
  assert.ok("error" in result, `unrecorded arm must reject, got ${JSON.stringify(result)}`);
  assertNames(result.error, "defer");
});

// ---- map() ---------------------------------------------------------------------------
test("map items: flowFixture keys each item by `${mapId}/${index}/${innerId}` from collection item runs", async () => {
  const api = await replayApi();
  const cap = await liveCapture(batchedFlow(), batchInput([30, 0, 15, 5]), batchedTransport);
  assert.deepEqual(cap.live, batchedExpected, "live premise");
  const items = cap.run.steps.batch.collection?.items ?? [];
  assert.deepEqual(
    items.map((i) => [i.index, i.status, i.run?.steps.assess?.status, !!i.run?.steps.assess?.traceId]),
    [[0, "completed", "completed", true], [1, "completed", "completed", true],
     [2, "completed", "completed", true], [3, "completed", "completed", true]],
    "premise: item runs carry linked inner jev steps",
  );
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  const fixture = roundTrip(built.fixture);
  assert.deepEqual(
    { fixture, missing: built.missing, warnings: built.warnings },
    {
      fixture: batchedGolden(),
      missing: [],
      warnings: [],
    },
    "item keys are composed; the root step that shares the inner id keeps its own key",
  );
  assertKeysAreTraceLinks(cap, fixture, "batched");
});

test("map items replay from their own keys, whatever the concurrency or execution order", async () => {
  const api = await replayApi();
  const cap = await liveCapture(batchedFlow(), batchInput([30, 0, 15, 5]), batchedTransport);
  assert.deepEqual(cap.live, batchedExpected, "live premise");
  const fixture = roundTrip(batchedGolden());
  const reversed: FlowFixture = {
    version: 1,
    flow: "batched",
    steps: Object.fromEntries(Object.entries(fixture.steps).reverse()),
  };
  const callOrder = async (concurrency: number, delays: number[], f: FlowFixture) => {
    const s = spy(api.replayClient(f));
    const out = await offline(() =>
      settle(() => batchedFlow(concurrency).run(batchInput(delays), { client: s.client })),
    );
    return {
      result: out.result,
      network: out.network,
      order: s.states.map((st) => (st as { text?: string }).text).filter(Boolean),
    };
  };
  const runs = [
    await callOrder(3, [30, 0, 15, 5], fixture),
    await callOrder(1, [0, 0, 0, 0], fixture),
    await callOrder(4, [0, 10, 20, 30], reversed),
    await callOrder(4, [30, 20, 10, 0], reversed),
  ];
  for (const [i, run] of runs.entries()) {
    assert.deepEqual(run.result, batchedExpected, `replay ${i}: each item answered from its own key`);
    assert.equal(run.network, 0, `replay ${i}: network`);
  }
  assert.deepEqual(runs[2].order, ["a", "b", "c", "d"], "premise: index-order execution");
  assert.deepEqual(runs[3].order, ["d", "c", "b", "a"], "premise: reverse execution order");
  // Concurrent replays on one client must not leak item identity into each other.
  const shared = api.replayClient(fixture);
  const both = await offline(() =>
    Promise.all([
      settle(() => batchedFlow(4).run(batchInput([0, 10, 20, 30]), { client: shared })),
      settle(() => batchedFlow(2).run(batchInput([30, 20, 10, 0]), { client: shared })),
    ]),
  );
  assert.deepEqual(both.result, [batchedExpected, batchedExpected]);
  assert.equal(both.network, 0);
  const observed = await offline(() =>
    replayFacts(batchedFlow(), batchInput([30, 0, 15, 5]), () => api.replayClient(fixture)),
  );
  assert.deepEqual(observed.result.result, batchedExpected, "observed replay");
  assert.deepEqual(observed.result.facts, facts(cap.run), "same root and item statuses");
});

test("map items whose SDK fetch is deferred by asset encoding still replay from their own keys", async () => {
  const api = await replayApi();
  const cap = await liveCapture(picturesFlow(), { items: [0, 1, 2] }, picturesTransport);
  const expected = { outcome: "done", value: [0.125, 0.25, 0.5] };
  assert.deepEqual(cap.live, expected, "live premise");
  const golden: FlowFixture = {
    version: 1,
    flow: "pictures",
    steps: Object.fromEntries(pictureAnswers.map((p, i) => [`shots/${i}/look`, noulBody({ p })])),
  };
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  assert.deepEqual(roundTrip(built.fixture), golden, "fixture keys");
  for (const fixture of [golden, { ...golden, steps: Object.fromEntries(Object.entries(golden.steps).reverse()) }]) {
    const { result, network } = await offline(() =>
      settle(() => picturesFlow().run({ items: [0, 1, 2] }, { client: api.replayClient(fixture) })),
    );
    assert.deepEqual(result, expected, "each deferred item call answered from its own key");
    assert.equal(network, 0);
  }
});

test("a map item whose key is missing rejects naming the composed key, as does a missing item answer", async () => {
  const api = await replayApi();
  const fixture = roundTrip(batchedGolden());
  const whole = await offline(() =>
    settle(() => batchedFlow().run(batchInput([0, 0, 0, 0]), { client: api.replayClient(fixture) })),
  );
  assert.deepEqual(whole.result, batchedExpected, "premise: the complete golden fixture replays");
  const withoutItem = roundTrip(fixture);
  delete withoutItem.steps["batch/2/assess"];
  const missingKey = await offline(() =>
    settle(() => batchedFlow().run(batchInput([0, 0, 0, 0]), { client: api.replayClient(withoutItem) })),
  );
  assert.ok("error" in missingKey.result, `missing item key must reject, got ${JSON.stringify(missingKey.result)}`);
  assertNames(missingKey.result.error, "batch/2/assess");
  assert.equal(missingKey.network, 0);
  const withoutAnswer = roundTrip(fixture);
  withoutAnswer.steps["batch/1/assess"] = { model: "sample", answers: {} };
  const missingAnswer = await offline(() =>
    settle(() => batchedFlow().run(batchInput([0, 0, 0, 0]), { client: api.replayClient(withoutAnswer) })),
  );
  assert.ok("error" in missingAnswer.result, `missing item answer must reject, got ${JSON.stringify(missingAnswer.result)}`);
  assertNames(missingAnswer.result.error, "batch/1/assess");
  assert.match(missingAnswer.result.error, /\byes\b/);
  // A fixture keyed by the bare inner id (no composition) is not accepted for items.
  const bare: FlowFixture = {
    version: 1,
    flow: "batched",
    steps: { plan: fixture.steps.plan, assess: noulBody({ yes: 0.5, ok: 0.375 }) },
  };
  const bareRun = await offline(() =>
    settle(() => batchedFlow(1).run(batchInput([0, 0, 0, 0]), { client: api.replayClient(bare) })),
  );
  assert.ok("error" in bareRun.result, `inner-id keys must not answer items, got ${JSON.stringify(bareRun.result)}`);
  assertNames(bareRun.result.error, "batch/0/assess");
});

test("flowFixture reports evicted and unlinked map item captures as missing by composed key", async () => {
  const api = await replayApi();
  // Limit 2, concurrency 1: the first item's trace is evicted when the third is created.
  const evicted = await liveCapture(namedRootFlow(), { items: [1, 2, 3] }, namedTransport, 2);
  assert.deepEqual(evicted.live, { outcome: "done", value: [0.125, 0.25, 0.375] }, "live premise");
  const first = evicted.run.steps.batch.collection!.items[0].run!.steps.assess;
  assert.ok(first.traceId && !evicted.traces.has(first.traceId), "premise: item 0 linked then evicted");
  const e = api.flowFixture(evicted.definition, evicted.run, evicted.traces);
  assert.deepEqual(
    { steps: Object.keys(e.fixture.steps), missing: e.missing },
    { steps: ["batch/1/assess", "batch/2/assess"], missing: ["batch/0/assess"] },
  );
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const result = await namedRootFlow().run({ items: [1, 2] }, {
      client: new TypeSafeClient(options(namedTransport)),
      devtools: inspector,
    });
    const unlinked = await captured(inspector, result.runId);
    const u = api.flowFixture(unlinked.definition, unlinked.run, unlinked.traces);
    assert.deepEqual(
      { steps: u.fixture.steps, missing: [...u.missing].sort() },
      { steps: {}, missing: ["batch/0/assess", "batch/1/assess"] },
    );
  } finally {
    inspector.dispose();
  }
});

// ---- loop() --------------------------------------------------------------------------
test("loop iterations are keyed `${loopId}/${iteration}/${innerId}` and replay to the same state", async () => {
  const api = await replayApi();
  const cap = await liveCapture(refineFlow(), null, refineTransport);
  const expected = { outcome: "done", value: { n: 3, total: 0.875 } };
  assert.deepEqual(cap.live, expected, "live premise");
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  const fixture = roundTrip(built.fixture);
  assert.deepEqual(
    { fixture, missing: built.missing },
    {
      fixture: {
        version: 1,
        flow: "refine",
        steps: {
          "rounds/0/ask": noulBody({ gain: 0.25 }),
          "rounds/1/ask": noulBody({ gain: 0.5 }),
          "rounds/2/ask": noulBody({ gain: 0.125 }),
        },
      },
      missing: [],
    },
  );
  assertKeysAreTraceLinks(cap, fixture, "refine");
  const { result, network } = await offline(() =>
    settle(() => refineFlow().run(null, { client: api.replayClient(fixture) })),
  );
  assert.deepEqual(result, expected, "replay state");
  assert.equal(network, 0);
  const observed = await offline(() =>
    replayFacts(refineFlow(), null, () => api.replayClient(fixture)),
  );
  assert.deepEqual(observed.result.facts, facts(cap.run), "same iterations, statuses and loop decision");
  // An iteration the capture never reached rejects naming its composed key.
  const short = roundTrip(fixture);
  short.steps["rounds/2/ask"] = noulBody({ gain: 0 });
  const extra = await offline(() =>
    settle(() => refineFlow().run(null, { client: api.replayClient(short) })),
  );
  assert.ok("error" in extra.result, `unrecorded iteration must reject, got ${JSON.stringify(extra.result)}`);
  assertNames(extra.result.error, "rounds/3/ask");
});

test("a loop containing a map nests composed keys `${loopId}/${i}/${mapId}/${j}/${innerId}`", async () => {
  const api = await replayApi();
  const cap = await liveCapture(sweepFlow(), { items: [1, 2] }, sweepTransport);
  assert.deepEqual(cap.live, sweepExpected, "live premise");
  const built = api.flowFixture(cap.definition, cap.run, cap.traces);
  const fixture = roundTrip(built.fixture);
  assert.deepEqual(
    { fixture, missing: built.missing },
    {
      fixture: {
        version: 1,
        flow: "sweep",
        steps: {
          "rounds/0/batch/0/assess": noulBody({ yes: 0.125 }),
          "rounds/0/batch/1/assess": noulBody({ yes: 0.25 }),
          "rounds/1/batch/0/assess": noulBody({ yes: 0.5 }),
          "rounds/1/batch/1/assess": noulBody({ yes: 0.75 }),
        },
      },
      missing: [],
    },
  );
  assertKeysAreTraceLinks(cap, fixture, "sweep");
  const { result, network } = await offline(() =>
    settle(() => sweepFlow().run({ items: [1, 2] }, { client: api.replayClient(fixture) })),
  );
  assert.deepEqual(result, sweepExpected, "replay state");
  assert.equal(network, 0);
  const observed = await offline(() =>
    replayFacts(sweepFlow(), { items: [1, 2] }, () => api.replayClient(fixture)),
  );
  assert.deepEqual(observed.result.facts, facts(cap.run), "same nested statuses");
  const gap = roundTrip(fixture);
  delete gap.steps["rounds/1/batch/0/assess"];
  const missing = await offline(() =>
    settle(() => sweepFlow().run({ items: [1, 2] }, { client: api.replayClient(gap) })),
  );
  assert.ok("error" in missing.result, `missing nested key must reject, got ${JSON.stringify(missing.result)}`);
  assertNames(missing.result.error, "rounds/1/batch/0/assess");
});

// ---- Flow name ------------------------------------------------------------------------
test("the flow-name check uses the root flow's name, never an item or iteration program's", async () => {
  const api = await replayApi();
  const map = namedRootFlow();
  assert.equal(map.definition.nodes[0].itemDefinition?.name, "Item · Batch", "premise: item program name");
  const cap = await liveCapture(map, { items: [1, 2] }, namedTransport);
  const fixture: FlowFixture = {
    version: 1,
    flow: "named-root",
    steps: { "batch/0/assess": noulBody({ yes: 0.125 }), "batch/1/assess": noulBody({ yes: 0.25 }) },
  };
  assert.deepEqual(
    roundTrip(api.flowFixture(cap.definition, cap.run, cap.traces).fixture),
    fixture,
    "flowFixture names the root flow",
  );
  const ok = await offline(() =>
    settle(() => namedRootFlow().run({ items: [1, 2] }, { client: api.replayClient(fixture) })),
  );
  assert.deepEqual(ok.result, { outcome: "done", value: [0.125, 0.25] }, "root-named fixture replays item calls");
  for (const flow of ["Item · Batch", "other-flow"]) {
    const wrong = await offline(() =>
      settle(() => namedRootFlow().run({ items: [1, 2] }, { client: api.replayClient({ ...fixture, flow }) })),
    );
    assert.ok("error" in wrong.result, `${flow}: must reject, got ${JSON.stringify(wrong.result)}`);
    assertNames(wrong.result.error, flow, flow);
    assertNames(wrong.result.error, "named-root");
    assert.doesNotMatch(wrong.result.error, /replaying flow "Item/, `${flow}: never reports an item program as the flow`);
    assert.equal(wrong.network, 0);
  }
  const loop = refineFlow();
  assert.equal(loop.definition.nodes[0].itemDefinition?.name, "Iteration · rounds", "premise: iteration program name");
  const loopCap = await liveCapture(loop, null, refineTransport);
  assert.equal(api.flowFixture(loopCap.definition, loopCap.run, loopCap.traces).fixture.flow, "refine");
  const loopFixture: FlowFixture = {
    version: 1,
    flow: "refine",
    steps: Object.fromEntries(gains.map((gain, i) => [`rounds/${i}/ask`, noulBody({ gain })])),
  };
  const rightLoop = await offline(() =>
    settle(() => refineFlow().run(null, { client: api.replayClient(loopFixture) })),
  );
  assert.deepEqual(rightLoop.result, { outcome: "done", value: { n: 3, total: 0.875 } }, "root-named fixture replays iterations");
  const wrongLoop = await offline(() =>
    settle(() => refineFlow().run(null, { client: api.replayClient({ ...loopFixture, flow: "Iteration · rounds" }) })),
  );
  assert.ok("error" in wrongLoop.result, `iteration-named fixture must reject, got ${JSON.stringify(wrongLoop.result)}`);
  assertNames(wrongLoop.result.error, "refine");
});
