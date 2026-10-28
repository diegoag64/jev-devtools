import { test } from "node:test";
import { noul } from "@typesafe-ai/sdk";
import { flowFixture } from "jev-devtools";
import assert from "node:assert/strict";
import { defineJevFlow, type FlowRun } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";
import { parseFlowUpdate } from "../src/flow-parser.js";
import type { FlowUpdate } from "../src/flow-protocol.js";

const origin = "http://localhost:5196";
const client = {
  systemOne(): never {
    throw new Error("Unexpected inference");
  },
};
const request = (session = "a", method = "GET") =>
  new Request(
    origin +
      "/api/jev-devtools/" +
      (method === "GET" ? "flows/events" : "clear"),
    { method, headers: { origin, "x-session": session } },
  );
async function snapshot(
  adapter: ReturnType<typeof createJevDevtools>,
  session = "a",
) {
  const response = await adapter.handle(request(session));
  const reader = response.body!.getReader();
  try {
    return decode((await reader.read()).value!);
  } finally {
    await reader.cancel();
  }
}
function decode(bytes: Uint8Array): FlowUpdate {
  const update = JSON.parse(new TextDecoder().decode(bytes).split("data: ")[1]);
  parseFlowUpdate(update, new Map(), new Map());
  return update;
}
function values(run: FlowRun) {
  let bytes = 0,
    omitted = 0;
  const visit = (run: FlowRun) => {
    if (run.value !== undefined)
      bytes += Buffer.byteLength(JSON.stringify(run.value));
    if (run.valueOmitted) {
      assert.equal(run.value, undefined);
      assert.ok(
        run.captureWarnings?.includes(
          "Outcome value omitted by flow capture byte budget.",
        ),
      );
      omitted++;
    }
    for (const step of Object.values(run.steps)) {
      if (step.data !== undefined)
        bytes += Buffer.byteLength(JSON.stringify(step.data));
      if (step.dataOmitted) {
        assert.equal(step.data, undefined);
        assert.ok(
          step.captureWarnings?.includes(
            "Step data omitted by flow capture byte budget.",
          ),
        );
        omitted++;
      }
      for (const item of step.collection?.items ?? [])
        if (item.run) visit(item.run);
    }
  };
  visit(run);
  return { bytes, omitted };
}

// Per-value tests do not establish an aggregate UTF-8 budget or omission provenance.
for (const input of [
  null,
  'é🧪\n"',
  "[capture unavailable]",
  { same: ["é", "é"] },
]) {
  const bytes = Buffer.byteLength(JSON.stringify(input));
  for (const budget of [bytes - 1, bytes, bytes + 1]) {
    test(`outcome byte budget ${budget} for ${JSON.stringify(input)} preserves execution`, async (t) => {
      const adapter = createJevDevtools({
        origin,
        enabled: true,
        flowCaptureBytes: budget,
      });
      t.after(() => adapter.dispose());
      const flow = defineJevFlow("bytes", (f) => f.output("done", input));
      assert.deepEqual(
        (await flow.run(null, { client, devtools: adapter })).value,
        input,
      );
      const run = (await snapshot(adapter)).upserts[0];
      if (budget < bytes) {
        assert.equal(run.valueOmitted, "budget");
        assert.equal(run.value, undefined);
      } else {
        assert.equal(run.valueOmitted, undefined);
        assert.deepEqual(run.value, input);
      }
      assert.ok(values(run).bytes <= budget);
      assert.equal(run.status, "success");
    });
  }
}

test("nested maps and loops share one allowance, count repeated values, and retain every execution", async (t) => {
  const flow = defineJevFlow("nested-budget", (f) => {
    const loop = f.loop(
      "rounds",
      {
        initial: 0,
        input: null,
        maxIterations: 2,
        while: (s) => s.lt(2),
      },
      (round) => {
        round.map(
          "items",
          { items: [1, 2, 3], input: null, maxItems: 3 },
          (item) =>
            item.task("work", {
              input: { item: item.input.get("item"), repeated: ["é", "é"] },
              run: () => "x".repeat(100),
            }),
        );
        return round.task("advance", {
          input: round.input.get("state"),
          run: (n) => n + 1,
        });
      },
    );
    return f.output("done", { final: loop });
  });
  let fullBytes = 0;
  for (const budget of [undefined, 0, 250, 100_000]) {
    const adapter = createJevDevtools({
      origin,
      enabled: true,
      flowCaptureBytes: budget,
    });
    t.after(() => adapter.dispose());
    assert.deepEqual(
      (await flow.run(null, { client, devtools: adapter })).value,
      { final: 2 },
    );
    const run = (await snapshot(adapter)).upserts[0];
    assert.equal(run.steps.rounds.collection!.items.length, 2);
    for (const round of run.steps.rounds.collection!.items) {
      assert.equal(round.run!.status, "success");
      assert.equal(round.run!.steps.items.collection!.items.length, 3);
      for (const item of round.run!.steps.items.collection!.items) {
        assert.equal(item.run!.status, "success");
        assert.equal(item.run!.steps.work.status, "completed");
      }
    }
    const result = values(run);
    if (budget === undefined) {
      fullBytes = result.bytes;
      assert.equal(result.omitted, 0);
    } else {
      assert.ok(result.bytes <= budget);
      assert.equal(result.omitted > 0, budget < fullBytes);
      if (budget === 100_000) assert.equal(result.bytes, fullBytes);
      if (budget === 250)
        assert.deepEqual(run.value, { final: 2 }, "root outcome has priority");
    }
  }
});

test("admission follows redaction, preserves existing warnings, and does not skip later small fields", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    flowCaptureBytes: 40,
    redact: (_path, value, context) =>
      context.kind === "outcome" && typeof value === "string"
        ? "hidden"
        : value,
  });
  t.after(() => adapter.dispose());
  const flow = defineJevFlow("redacted-budget", (f) => {
    f.task("large", { input: null, run: () => "x".repeat(20_000) });
    f.task("small", { input: null, run: () => 1 });
    return f.output("done", "original");
  });
  assert.equal(
    (await flow.run(null, { client, devtools: adapter })).value,
    "original",
  );
  const run = (await snapshot(adapter)).upserts[0];
  assert.equal(run.value, "hidden");
  assert.equal(run.valueOmitted, undefined);
  assert.ok(run.captureWarnings!.includes("Capture contains redacted values."));
  assert.equal(run.steps.large.dataOmitted, "budget");
  assert.ok(
    run.steps.large.captureWarnings!.includes(
      "Long text truncated in capture.",
    ),
  );
  assert.deepEqual(run.steps.small.data, { input: null, output: 1 });
  assert.ok(values(run).bytes <= 40);
});

test("budget resets per snapshot and per run while stalled readers, sessions, clear, and eviction retain policy", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    flowCaptureBytes: 32,
    limit: 1,
    getSession: (request) => request.headers.get("x-session")!,
  });
  t.after(() => adapter.dispose());
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const flow = defineJevFlow("transitions", (f) => {
    const value = f.task("work", { input: null, run: () => "12345" });
    f.task("gate", {
      input: null,
      run: async () => {
        ready();
        await gate;
        return null;
      },
    });
    return f.output("done", value);
  });
  const response = await adapter.handle(request());
  const stalled = response.body!.getReader();
  t.after(() => stalled.cancel());
  const running = adapter.run(request(), () =>
    flow.run(null, { client, devtools: adapter }),
  );
  await started;
  const pendingUpdate = await snapshot(adapter);
  const pending = pendingUpdate.upserts[0];
  const previous = parseFlowUpdate(pendingUpdate, new Map(), new Map());
  assert.equal(pending.steps.gate.status, "running");
  assert.deepEqual(pending.steps.work.data, { input: null, output: "12345" });
  resume();
  assert.equal((await running).value, "12345");
  const finalUpdate = await snapshot(adapter);
  const final = parseFlowUpdate(
    finalUpdate,
    previous.runs,
    previous.definitions,
  )
    .runs.values()
    .next().value!;
  assert.equal(final.value, "12345");
  assert.equal(
    final.steps.work.dataOmitted,
    "budget",
    "terminal outcome can displace earlier step data",
  );
  assert.ok(values(final).bytes <= 32);
  assert.equal(decode((await stalled.read()).value!).upserts.length, 0);
  assert.deepEqual(decode((await stalled.read()).value!).upserts[0], final);
  assert.equal((await snapshot(adapter, "b")).upserts.length, 0);
  const next = await adapter.run(request("b"), () =>
    flow.run(null, { client, devtools: adapter }),
  );
  assert.equal(
    (await snapshot(adapter)).upserts.length,
    0,
    "cross-session eviction",
  );
  const other = (await snapshot(adapter, "b")).upserts[0];
  assert.equal(other.id, next.runId);
  assert.equal(other.value, "12345", "a new run receives a fresh allowance");
  await adapter.handle(request("b", "DELETE"));
  assert.equal((await snapshot(adapter, "b")).upserts.length, 0);
});

test("omission metadata rejects contradictory or unknown values while old captures remain valid", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    flowCaptureBytes: 0,
  });
  t.after(() => adapter.dispose());
  const flow = defineJevFlow("metadata", (f) =>
    f.output("done", f.task("work", { input: 1, run: (n) => n })),
  );
  await flow.run(null, { client, devtools: adapter });
  const update = await snapshot(adapter);
  for (const change of [
    (run: FlowRun) => {
      run.value = null;
    },
    (run: FlowRun) => {
      run.steps.work.data = null;
    },
    (run: FlowRun) => {
      (run as any).valueOmitted = true;
    },
    (run: FlowRun) => {
      (run.steps.work as any).dataOmitted = "unknown";
    },
  ]) {
    const invalid = structuredClone(update);
    change(invalid.upserts[0]);
    assert.throws(() => parseFlowUpdate(invalid, new Map(), new Map()));
  }
  const old = structuredClone(update);
  delete old.upserts[0].valueOmitted;
  delete old.upserts[0].steps.work.dataOmitted;
  assert.doesNotThrow(() => parseFlowUpdate(old, new Map(), new Map()));
});

test("flowCaptureBytes rejects invalid numeric configuration", () => {
  for (const flowCaptureBytes of [
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(
      () => createJevDevtools({ origin, flowCaptureBytes }),
      /flowCaptureBytes/,
    );
});

for (const terminal of ["error", "cancelled"] as const) {
  test(`budgeted ${terminal} captures retain terminal state and completed steps`, async (t) => {
    const adapter = createJevDevtools({
      origin,
      enabled: true,
      flowCaptureBytes: 0,
    });
    t.after(() => adapter.dispose());
    const controller = new AbortController();
    const flow = defineJevFlow("terminal-budget", (f) => {
      f.task("complete", { input: null, run: () => "full" });
      f.task("stop", {
        input: null,
        run: () => {
          if (terminal === "cancelled") controller.abort();
          else throw new Error("sample failure");
          return null;
        },
      });
      return f.output("done", "unreached");
    });
    await assert.rejects(
      flow.run(null, { client, devtools: adapter, signal: controller.signal }),
    );
    const run = (await snapshot(adapter)).upserts[0];
    assert.equal(run.status, terminal);
    assert.equal(run.steps.complete.status, "completed");
    assert.equal(run.steps.complete.dataOmitted, "budget");
    assert.equal(values(run).bytes, 0);
  });
}

test("budget omissions preserve Jev traces, rule captures, and replay fixture links", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    flowCaptureBytes: 0,
  });
  t.after(() => adapter.dispose());
  const response = {
    model: "fixture",
    answers: { ok: { type: "noul", noul: 0.8 } },
    state: "original",
  };
  const client = adapter.createClient({
    apiKey: "sample",
    logLevel: "off",
    fetch: async () => Response.json(response),
  });
  const flow = defineJevFlow("fixture-budget", (f) => {
    const result = f.jev("request", {
      state: "original",
      questions: { ok: noul("OK?") },
    });
    return f.branch("accept", {
      when: result.answer("ok").noul.gte(0.5),
      then: (p) => p.output("yes", result.answers),
      else: (p) => p.output("no"),
    });
  });
  assert.deepEqual(
    (await flow.run(null, { client, devtools: adapter })).value,
    response.answers,
  );
  const update = await snapshot(adapter);
  const stream = (
    await adapter.handle(new Request(origin + "/api/jev-devtools/events"))
  ).body!.getReader();
  try {
    const traces = JSON.parse(
      new TextDecoder().decode((await stream.read()).value).split("data: ")[1],
    ).traces;
    const run = update.upserts[0];
    assert.equal(run.valueOmitted, "budget");
    assert.ok(run.steps.request.traceId);
    assert.equal(run.steps.accept.decision, true);
    assert.ok(
      update.definitions[0].nodes.find((node) => node.id === "accept")!
        .conditionRule,
    );
    const exported = flowFixture(
      update.definitions[0],
      run,
      new Map(traces.map((trace: any) => [trace.id, trace])),
    );
    assert.deepEqual(exported.missing, []);
    assert.deepEqual(exported.fixture.steps.request, traces[0].result);
    assert.deepEqual(traces[0].result.answers, response.answers);
  } finally {
    await stream.cancel();
  }
});

test("initial observer seeds obey the budget without changing source captures", async (t) => {
  const source = createJevDevtools({ origin, enabled: true });
  const bounded = createJevDevtools({
    origin,
    enabled: true,
    flowCaptureBytes: 0,
  });
  t.after(() => {
    source.dispose();
    bounded.dispose();
  });
  const flow = defineJevFlow("seed-budget", (f) =>
    f.output("done", f.task("work", { input: null, run: () => "original" })),
  );
  await flow.run(null, { client, devtools: source });
  const update = await snapshot(source);
  const before = structuredClone(update);
  bounded.startFlow(update.definitions[0], update.upserts[0]);
  const run = (await snapshot(bounded)).upserts[0];
  assert.equal(run.valueOmitted, "budget");
  assert.equal(run.steps.work.dataOmitted, "budget");
  assert.equal(values(run).bytes, 0);
  assert.deepEqual(update, before);
});

test("reused immutable child snapshots still consume their bytes on each update", async (t) => {
  const source = createJevDevtools({ origin, enabled: true });
  const bounded = createJevDevtools({
    origin,
    enabled: true,
    flowCaptureBytes: 350,
  });
  t.after(() => {
    source.dispose();
    bounded.dispose();
  });
  const flow = defineJevFlow("cached-budget", (f) =>
    f.output(
      "done",
      f.map(
        "items",
        {
          items: [0, 1],
          input: null,
          maxItems: 2,
        },
        (item) =>
          item.task("work", { input: null, run: () => "x".repeat(100) }),
      ),
    ),
  );
  await flow.run(null, { client, devtools: source });
  const update = await snapshot(source);
  const observer = bounded.startFlow(update.definitions[0], update.upserts[0])!;
  for (let index = 0; index < 3; index++) {
    observer.update(update.upserts[0]);
    const run = (await snapshot(bounded)).upserts[0];
    assert.ok(
      values(run).bytes <= 350,
      "cached children must charge the shared allowance",
    );
    assert.equal(run.steps.items.collection!.items.length, 2);
  }
  observer.update({ ...update.upserts[0], value: "y".repeat(300) });
  const changed = (await snapshot(bounded)).upserts[0];
  assert.ok(
    values(changed).bytes <= 350,
    "changed allowance must invalidate a cached projection",
  );
  assert.equal(
    changed.steps.items.collection!.items[0].run!.valueOmitted,
    "budget",
  );
});
