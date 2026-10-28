import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { score } from "@typesafe-ai/sdk";
import { flowFixture, type Trace } from "jev-devtools";
import { defineJevFlow, all } from "jev-devtools/flow";
import { createJevDevtools, type CaptureOptions } from "jev-devtools/server";
import { captureWithFidelity } from "../server/recorder.js";
import { FlowRecorder } from "../server/flows.js";
import { parseFlowUpdate } from "../src/flow-parser.js";
import { TraceStore } from "../src/trace-store.js";
import { createDisplayRedactor } from "../src/display-redaction.js";
import { traceCaptureView } from "../src/capture-view.js";
import { conditionInputs } from "../src/condition-inputs.js";
import type { FlowDefinition, FlowRun } from "../src/flow-protocol.js";

const origin = "http://localhost:5197";
const client = {
  systemOne(): never {
    throw new Error("Unexpected inference");
  },
};
async function history(inspector: ReturnType<typeof createJevDevtools>) {
  const response = await inspector.handle(
    new Request(origin + "/api/jev-devtools/flows/events"),
  );
  const reader = response.body!.getReader();
  try {
    const first = await reader.read();
    const wire = JSON.parse(
      new TextDecoder().decode(first.value).split("data: ")[1],
    );
    const parsed = parseFlowUpdate(wire, new Map(), new Map());
    return {
      wire,
      definition: [...parsed.definitions.values()][0],
      run: [...parsed.runs.values()][0],
    };
  } finally {
    await reader.cancel();
  }
}

// The historical draft accepted 0.6 because it reproduced the recorded >=0.5
// decision, then falsely predicted a flip at 0.8. Even [] warnings cannot attest
// unchanged content. The producer's real observer -> recorder -> SSE boundary
// must distinguish all three callback forms from an exact JSON capture.
for (const mode of ["none", "identity", "replacement", "mutation"] as const) {
  test(`numeric capture provenance survives transport: ${mode}`, async (t) => {
    const redact: CaptureOptions["redact"] =
      mode === "none"
        ? undefined
        : (path, value) => {
            if (
              mode === "replacement" &&
              path.join(".") === "steps.score.data.output"
            )
              return 0.6;
            if (mode === "mutation" && path.join(".") === "steps.score.data")
              (value as { output: number }).output = 0.6;
            return value;
          };
    const inspector = createJevDevtools({ origin, enabled: true, redact });
    t.after(() => inspector.dispose());
    const flow = defineJevFlow("threshold", (f) => {
      const value = f.task("score", { input: null, run: () => 0.9 });
      return f.branch("gate", {
        when: value.gte(0.5),
        then: (p) => p.output("yes", value),
        else: (p) => p.output("no"),
      });
    });
    const result = await flow.run(null, { client, devtools: inspector });
    assert.equal(result.outcome, "yes");
    assert.equal(result.value, 0.9);
    const { definition, run, wire } = await history(inspector);
    assert.equal(run.steps.gate.decision, true);
    const data = run.steps.score.data as { output: number };
    assert.equal(
      data.output,
      mode === "replacement" || mode === "mutation" ? 0.6 : 0.9,
    );
    assert.equal(
      run.steps.score.captureFidelity,
      mode === "none"
        ? "exact"
        : mode === "replacement"
          ? "modified"
          : "unknown",
    );
    assert.equal(
      definition.nodes.find((n) => n.id === "gate")!.conditionCaptureFidelity,
      mode === "none" ? "exact" : "unknown",
    );
    assert.equal(run.captureFidelity, mode === "none" ? "exact" : "unknown");
    if (mode === "mutation")
      assert.deepEqual(run.steps.score.captureWarnings, []);
    // Legacy metadata stays absent, including when warnings are explicitly empty.
    for (const node of wire.definitions[0].nodes)
      delete node.conditionCaptureFidelity;
    delete wire.upserts[0].captureFidelity;
    for (const step of Object.values(wire.upserts[0].steps) as any[])
      delete step.captureFidelity;
    const legacy = parseFlowUpdate(wire, new Map(), new Map());
    assert.equal(
      [...legacy.runs.values()][0].steps.score.captureFidelity,
      undefined,
    );
    assert.equal(
      [...legacy.definitions.values()][0].nodes.find((n) => n.id === "gate")!
        .conditionCaptureFidelity,
      undefined,
    );
    wire.upserts[0].steps.score.captureFidelity = "lossless";
    assert.throws(
      () => parseFlowUpdate(wire, new Map(), new Map()),
      /Invalid flow run/,
    );
  });
}

test("signed-zero transport normalization downgrades rules, step data, and outcomes", async (t) => {
  for (const value of [-0, 0]) {
    const inspector = createJevDevtools({ origin, enabled: true });
    t.after(() => inspector.dispose());
    const flow = defineJevFlow("signed-zero", (f) => {
      const result = f.task("score", { input: null, run: () => value });
      return f.branch("gate", {
        when: result.eq(value),
        then: (p) => p.output("yes", result),
        else: (p) => p.output("no"),
      });
    });
    const result = await flow.run(null, { client, devtools: inspector });
    assert.ok(Object.is(result.value, value), "execution preserves the scalar");
    const { definition, run } = await history(inspector);
    assert.ok(Object.is(run.value, 0));
    assert.ok(
      Object.is((run.steps.score.data as { output: number }).output, 0),
    );
    assert.equal(run.steps.gate.decision, true);
    const fidelity = Object.is(value, -0) ? "modified" : "exact";
    assert.equal(run.captureFidelity, fidelity);
    assert.equal(run.steps.score.captureFidelity, fidelity);
    assert.equal(
      definition.nodes.find((node) => node.id === "gate")!
        .conditionCaptureFidelity,
      fidelity,
    );
  }
});

test("array method overrides cannot rewrite exact captured SDK request values", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  const state = [0.9];
  let sliceCalls = 0;
  state.slice = () => {
    sliceCalls++;
    return [0.6];
  };
  let sent: { state: number[] } | undefined;
  const sdk = inspector.createClient({
    apiKey: "sample",
    logLevel: "off",
    compression: false,
    fetch: async (_input, init) => {
      sent = JSON.parse(init!.body as string);
      return Response.json({
        model: "sample",
        answers: { q: { type: "score", score: 0.9 } },
      });
    },
  });
  await sdk.systemOne({
    state,
    questions: { q: score("score", ["low", "high"]) },
  });
  await nextTurn();
  await nextTurn();
  const stream = await inspector.handle(
    new Request(`${origin}/api/jev-devtools/events?protocol=2`),
  );
  const reader = stream.body!.getReader();
  try {
    const first = await reader.read();
    const payload = JSON.parse(
      new TextDecoder().decode(first.value).split("data: ")[1],
    );
    const [trace] = new TraceStore().apply("snapshot", payload);
    assert.deepEqual(sent?.state, [0.9]);
    assert.deepEqual(trace.request.state, sent!.state);
    assert.equal(trace.captureFidelity?.request, "exact");
    assert.deepEqual(trace.captureWarnings, []);
    assert.equal(
      sliceCalls,
      0,
      "capture reads retained indices, not user methods",
    );
    assert.equal(state[0], 0.9);
  } finally {
    await reader.cancel();
  }
});

test("self-replacing request getters retain unknown provenance through SDK and SSE", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  let sent: { state: number[] } | undefined;
  const sdk = inspector.createClient({
    apiKey: "sample",
    logLevel: "off",
    compression: false,
    fetch: async (_input, init) => {
      sent = JSON.parse(init!.body as string);
      return Response.json({
        model: "sample",
        answers: { q: { type: "score", score: 0.9 } },
      });
    },
  });
  const request = {
    state: [0.9],
    questions: { q: score("score", ["low", "high"]) },
  };
  let reads = 0;
  Object.defineProperty(request, "state", {
    enumerable: true,
    configurable: true,
    get() {
      reads++;
      Object.defineProperty(request, "state", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: [0.6],
      });
      return [0.9];
    },
  });
  const result = await sdk.systemOne(request);
  assert.equal(result.answers.q.score, 0.9);
  assert.equal(reads, 1);
  assert.equal(
    Object.getOwnPropertyDescriptor(request, "state")!.get,
    undefined,
  );
  await nextTurn();
  await nextTurn();
  const stream = await inspector.handle(
    new Request(`${origin}/api/jev-devtools/events?protocol=2`),
  );
  const reader = stream.body!.getReader();
  try {
    const first = await reader.read();
    const payload = JSON.parse(
      new TextDecoder().decode(first.value).split("data: ")[1],
    );
    const [trace] = new TraceStore().apply("snapshot", payload);
    assert.deepEqual(sent?.state, [0.6]);
    assert.deepEqual(trace.request.state, [0.9]);
    assert.deepEqual(trace.captureWarnings, []);
    assert.equal(trace.captureFidelity?.request, "unknown");
    assert.equal(trace.captureFidelity?.result, "exact");
  } finally {
    await reader.cancel();
  }
});

test("inherited array iterators cannot certify normalized observer and merge values", async (t) => {
  class Values extends Array<number> {
    [Symbol.iterator]() {
      return [0.6][Symbol.iterator]();
    }
  }
  const input = new Values();
  input.push(0.9);
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  const flow = defineJevFlow<Values>("array-iterator", (f) => {
    const selected = f.if("select", {
      when: f.input.get("length").eq(1),
      then: (p) => p.input,
      else: (p) => p.input,
    });
    return f.output("done", selected);
  });
  const result = await flow.run(input, { client, devtools: inspector });
  assert.equal(
    result.value,
    input,
    "capture does not replace execution values",
  );
  assert.equal(input[0], 0.9);
  const { run } = await history(inspector);
  assert.equal(run.captureFidelity, "unknown");
  const merge = Object.values(run.steps).find(
    (step) => step.data !== undefined,
  )!;
  assert.deepEqual(merge.data, { output: [0.6] });
  assert.equal(merge.captureFidelity, "unknown");
});

test("nested captures preserve upstream rule limits, truncation, and unavailable outcomes", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  const long = "x".repeat(16_001);
  const flow = defineJevFlow<string[]>("nested", (f) => {
    const items = f.map(
      "items",
      { items: f.input, input: null, concurrency: 1, maxItems: 1 },
      (p) => {
        const value = p.task("work", {
          input: p.input.get("item"),
          run: (x) => x,
        });
        return p.if("gate", {
          when: all(...Array.from({ length: 45 }, () => value.eq(long))),
          then: () => value,
          else: () => value,
        });
      },
    );
    return f.output("done", items);
  });
  assert.deepEqual(
    (await flow.run([long], { client, devtools: inspector })).value,
    [long],
  );
  const { definition, run } = await history(inspector);
  const child = run.steps.items.collection!.items[0].run!;
  assert.equal(child.steps.work.captureFidelity, "modified");
  assert.equal(child.captureFidelity, "modified");
  assert.equal(run.captureFidelity, "modified");
  const gate = definition.nodes
    .find((n) => n.id === "items")!
    .itemDefinition!.nodes.find((n) => n.id === "gate")!;
  assert.equal(gate.conditionCaptureFidelity, "modified");
  assert.ok(
    gate.conditionCaptureWarnings!.includes("Rule projection limit reached."),
  );
});

test("unsupported observer values and merges cannot become exact marker captures", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  const flow = defineJevFlow<{ value: unknown; flag: boolean }>(
    "unsupported",
    (f) => {
      const selected = f.if("choose", {
        when: f.input.get("flag").eq(true),
        then: (p) => p.input.get("value"),
        else: (p) => p.input.get("value"),
      });
      return f.output("done", selected);
    },
  );
  const date = new Date(0);
  assert.equal(
    (
      await flow.run(
        { value: date, flag: true },
        { client, devtools: inspector },
      )
    ).value,
    date,
  );
  const { run } = await history(inspector);
  assert.equal(run.captureFidelity, "modified");
  assert.ok(run.captureWarnings!.length);
  const merge = Object.values(run.steps).find((s) =>
    s.captureWarnings?.includes("Selected value capture unavailable."),
  )!;
  assert.equal(merge.captureFidelity, "modified");
});

test("capture traversal records silent JSON changes without treating user strings as metadata", () => {
  const shared = { value: 1 };
  const sparse = Array(2);
  sparse[1] = 1;
  for (const value of [
    undefined,
    NaN,
    Infinity,
    1n,
    () => 1,
    new Date(0),
    new Map(),
    sparse,
    { a: shared, b: shared },
    { [Symbol()]: 1 },
  ]) {
    assert.equal(captureWithFidelity(value, new Set()).fidelity, "modified");
  }
  for (const value of [
    null,
    false,
    0,
    "[redacted]",
    "[truncated]",
    "[capture unavailable]",
    { a: [1, "[rule truncated]"] },
  ]) {
    assert.deepEqual(captureWithFidelity(value, new Set()), {
      value,
      fidelity: "exact",
    });
  }
  assert.equal(
    captureWithFidelity(
      {
        get value() {
          return 1;
        },
      },
      new Set(),
    ).fidelity,
    "unknown",
  );
  for (const size of [149, 150, 151])
    assert.equal(
      captureWithFidelity(Array(size).fill(1), new Set()).fidelity,
      size <= 150 ? "exact" : "modified",
    );
  for (const size of [15999, 16000, 16001])
    assert.equal(
      captureWithFidelity("x".repeat(size), new Set()).fidelity,
      size <= 16000 ? "exact" : "modified",
    );
});

test("custom observer records with empty warnings do not acquire exactness at storage", () => {
  const definition: FlowDefinition = {
    version: 1,
    id: "d",
    name: "legacy",
    nodes: [{ id: "task", kind: "task", dependencies: [], path: [] }],
  };
  const run: FlowRun = {
    version: 1,
    id: "r",
    definitionId: "d",
    name: "legacy",
    status: "success",
    startedAt: 0,
    value: 1,
    captureWarnings: [],
    steps: {
      task: {
        id: "task",
        executionId: "e",
        status: "completed",
        data: { output: 1 },
        captureWarnings: [],
      },
    },
  };
  const recorder = new FlowRecorder({});
  recorder.start(definition, run, "local");
  recorder.update(run);
  const stored = recorder.changes("local").data.upserts[0];
  assert.equal(stored.captureFidelity, "unknown");
  assert.equal(stored.steps.task.captureFidelity, "unknown");
  // Exact metadata describes a value, not whether a reference can resolve.
  const rule = {
    op: "reference",
    label: "task.score",
    name: "score",
    probability: false,
    stepId: "task",
    source: "task",
    path: ["missing"],
  };
  assert.equal(
    conditionInputs(rule, stored, new Map())[0].value,
    "Not captured",
  );
  assert.equal(
    conditionInputs({ ...rule, path: [42] }, stored, new Map())[0].value,
    "Not captured",
  );
  assert.equal(
    conditionInputs({ ...rule, stepId: "evicted" }, stored, new Map())[0].value,
    "Not captured",
  );
});

for (const mode of [
  "none",
  "request-secret",
  "response-replace",
  "response-fail",
] as const) {
  test(`request/result fidelity is independent and fixtures retain captured semantics: ${mode}`, async (t) => {
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: mode.startsWith("response")
        ? (path, value) => {
            if (path.join(".") === "answers.q.score") {
              if (mode === "response-fail") throw new Error("private");
              return 0.6;
            }
            return value;
          }
        : undefined,
    });
    t.after(() => inspector.dispose());
    const sdk = inspector.createClient({
      apiKey: "sample",
      logLevel: "off",
      fetch: async () =>
        Response.json({
          model: "sample",
          answers: { q: { type: "score", score: 0.9 } },
        }),
    });
    const response = await sdk.systemOne({
      state: mode === "request-secret" ? { password: "private" } : "[redacted]",
      questions: { q: score("score", ["low", "high"]) },
    });
    assert.equal(response.answers.q.score, 0.9);
    await nextTurn();
    await nextTurn();
    for (const protocol of [1, 2]) {
      const stream = await inspector.handle(
        new Request(`${origin}/api/jev-devtools/events?protocol=${protocol}`),
      );
      const reader = stream.body!.getReader();
      const first = await reader.read();
      await reader.cancel();
      const payload = JSON.parse(
        new TextDecoder().decode(first.value).split("data: ")[1],
      );
      const [trace] = new TraceStore().apply("snapshot", payload);
      assert.equal(
        trace.captureFidelity?.request,
        mode === "request-secret"
          ? "modified"
          : mode.startsWith("response")
            ? "unknown"
            : "exact",
      );
      assert.equal(
        trace.captureFidelity?.result,
        mode.startsWith("response") ? "modified" : "exact",
      );
      const definition: FlowDefinition = {
        version: 1,
        id: "d",
        name: "fixture",
        nodes: [{ id: "q", kind: "jev", dependencies: [], path: [] }],
      };
      const run: FlowRun = {
        version: 1,
        id: "r",
        definitionId: "d",
        name: "fixture",
        status: "success",
        startedAt: 0,
        steps: {
          q: {
            id: "q",
            executionId: "e",
            status: "completed",
            traceId: trace.id,
          },
        },
      };
      const built = flowFixture(definition, run, new Map([[trace.id, trace]]));
      if (mode === "response-fail") assert.deepEqual(built.missing, ["q"]);
      else assert.deepEqual(built.fixture.steps.q, trace.result);
      delete payload.traces[0].captureFidelity;
      assert.equal(
        new TraceStore().apply("snapshot", payload)[0].captureFidelity,
        undefined,
      );
      payload.traces[0].captureFidelity = { result: "lossless" };
      assert.throws(
        () => new TraceStore().apply("snapshot", payload),
        /Invalid trace record/,
      );
    }
  });
}

test("display masking and incompatible structured projections downgrade only changed sections", () => {
  const trace: Trace = {
    version: 1,
    id: "t",
    session: "local",
    label: "test",
    source: "sample",
    status: "success",
    startedAt: 0,
    request: {
      model: "sample",
      state: { email: "private@example.com" },
      questions: {},
    },
    result: { model: "sample", answers: {} },
    attempts: [],
    captureWarnings: [],
    captureFidelity: { request: "exact", result: "exact" },
  };
  const redactor = createDisplayRedactor();
  const masked = redactor.trace(trace);
  assert.equal(masked.captureFidelity?.request, "modified");
  assert.equal(masked.captureFidelity?.result, "exact");
  assert.equal(trace.captureFidelity?.request, "exact");
  const incompatible = {
    ...trace,
    result: {
      model: "sample",
      answers: { q: { type: "score", score: "wrong" } },
    },
  } as unknown as Trace;
  assert.equal(
    traceCaptureView(incompatible).captureFidelity?.result,
    "modified",
  );
  const run: FlowRun = {
    version: 1,
    id: "r",
    definitionId: "d",
    name: "mask",
    status: "success",
    startedAt: 0,
    value: 7,
    captureFidelity: "exact",
    steps: {
      task: {
        id: "task",
        executionId: "e",
        status: "completed",
        data: { output: { email: "private" } },
        captureFidelity: "exact",
      },
    },
  };
  const maskedRun = redactor.run(run);
  assert.equal(maskedRun.steps.task.captureFidelity, "modified");
  assert.equal(maskedRun.captureFidelity, "exact");
});

test("accessor and proxy outcomes stay unknown through observer and merge copies", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  for (const value of [
    {
      get score() {
        return 0.9;
      },
    },
    new Proxy({ score: 0.9 }, {}),
  ]) {
    for (const merge of [false, true]) {
      const flow = defineJevFlow<{ value: { score: number }; flag: boolean }>(
        "dynamic",
        (f) => {
          const output = merge
            ? f.if("choose", {
                when: f.input.get("flag").eq(true),
                then: (p) => p.input.get("value"),
                else: (p) => p.input.get("value"),
              })
            : f.input.get("value");
          return f.output("done", output);
        },
      );
      const result = await flow.run(
        { value, flag: true },
        { client, devtools: inspector },
      );
      assert.equal(result.value, value);
      const { run } = await history(inspector);
      assert.equal(run.captureFidelity, "unknown");
      if (merge)
        assert.equal(
          Object.values(run.steps).find((step) => step.data !== undefined)!
            .captureFidelity,
          "unknown",
        );
    }
  }
});

test("array provenance visits retained indices without enumerating the entire input", () => {
  let descriptors = 0;
  const value = new Proxy(Array(151).fill(1), {
    ownKeys() {
      throw new Error("Capture must not enumerate the whole array");
    },
    getOwnPropertyDescriptor(target, key) {
      descriptors++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const result = captureWithFidelity(value, new Set());
  assert.equal(result.fidelity, "modified");
  assert.equal((result.value as unknown[]).length, 150);
  assert.equal(descriptors, 150);
});
