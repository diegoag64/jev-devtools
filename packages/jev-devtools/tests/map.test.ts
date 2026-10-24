import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { defineJevFlow, type FlowObserver } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import { FlowRecorder } from "../server/flows.js";
const client = new TypeSafeClient({ apiKey: "sample", logLevel: "off" });
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const recording = () => {
  const recorder = new FlowRecorder({
    redact: (path, value) =>
      path.at(-1) === "privateValue" ? "[hidden]" : value,
  });
  const observer: FlowObserver = {
    startFlow(definition, run) {
      recorder.start(definition, run, "test");
      return {
        update: (next) => recorder.update(next),
        request: (_link, _onTrace, call) => call(),
      };
    },
  };
  return {
    recorder,
    observer,
    latest: () => recorder.changes("test").data.upserts[0],
  };
};

test("map bounds concurrency, returns input order, isolates items/runs and captures item results with redaction", async () => {
  const gates = [deferred(), deferred(), deferred()];
  const started = [deferred(), deferred(), deferred()];
  let active = 0,
    peak = 0;
  const flow = defineJevFlow<{ values: number[]; privateValue: string }>(
    "mapped",
    (f) => {
      const values = f.map(
        "batch",
        {
          items: f.input.get("values"),
          input: { privateValue: f.input.get("privateValue") },
          concurrency: 2,
          maxItems: 3,
        },
        (item) =>
          item.task("item-result", {
            input: item.input,
            run: async ({ item, index, context }) => {
              active++;
              peak = Math.max(peak, active);
              started[index].resolve();
              await gates[index].promise;
              active--;
              return {
                value: item * 2,
                index,
                privateValue: context.privateValue,
              };
            },
          }),
      );
      return f.output("done", values);
    },
  );
  assert.equal(active, 0);
  const history = recording();
  const pending = flow.run(
    { values: [10, 20, 30], privateValue: "sensitive" },
    { client, devtools: history.observer },
  );
  await Promise.all([started[0].promise, started[1].promise]);
  assert.equal(
    history.latest().steps.batch.collection!.items[2].status,
    "waiting",
  );
  gates[1].resolve();
  await started[2].promise;
  gates[2].resolve();
  gates[0].resolve();
  assert.deepEqual(
    (await pending).value,
    [10, 20, 30].map((v, index) => ({
      value: v * 2,
      index,
      privateValue: "sensitive",
    })),
  );
  assert.equal(peak, 2);
  const recorded = history.latest();
  assert.equal(recorded.steps.batch.collection!.items.length, 3);
  assert.equal(
    new Set(recorded.steps.batch.collection!.items.map((item) => item.run!.id))
      .size,
    3,
  );
  assert.ok(!JSON.stringify(recorded).includes("sensitive"));
  assert.ok(JSON.stringify(recorded).includes("[hidden]"));
  const concurrent = await Promise.all(
    [4, 9].map((value) =>
      flow.run({ values: [value], privateValue: String(value) }, { client }),
    ),
  );
  assert.deepEqual(
    concurrent.map((run) => run.value),
    [
      [{ value: 8, index: 0, privateValue: "4" }],
      [{ value: 18, index: 0, privateValue: "9" }],
    ],
  );
  const other = await flow.run(
    { values: [7], privateValue: "other" },
    { client },
  );
  assert.deepEqual(other.value, [
    { value: 14, index: 0, privateValue: "other" },
  ]);
  assert.deepEqual(
    (await flow.run({ values: [], privateValue: "unused" }, { client })).value,
    [],
  );
  await assert.rejects(
    flow.run({ values: [1, 2, 3, 4], privateValue: "unused" }, { client }),
    /maxItems/,
  );
  await assert.rejects(
    flow.run({ values: null as never, privateValue: "unused" }, { client }),
    /array/,
  );
});

test("map failure or cancellation stops queued work, settles uncooperative callbacks and never advances downstream", async () => {
  for (const failure of [false, true]) {
    const first = deferred(),
      second = deferred(),
      trigger = deferred(),
      late = deferred();
    const abort = new AbortController();
    const seen: number[] = [];
    let downstream = 0;
    const flow = defineJevFlow("stop", (f) => {
      const mapped = f.map(
        "batch",
        { items: [0, 1, 2, 3], input: {}, maxItems: 4, concurrency: 2 },
        (item) =>
          item.task("work", {
            input: item.input.get("item"),
            run: async (index) => {
              seen.push(index);
              if (index === 0) {
                first.resolve();
                await trigger.promise;
                throw new Error("first failure");
              }
              second.resolve();
              await late.promise;
              return index;
            },
          }),
      );
      f.task("downstream", {
        input: mapped,
        run: () => {
          downstream++;
          return null;
        },
      });
      return f.output("done");
    });
    const history = recording();
    const pending = flow.run(
      {},
      { client, devtools: history.observer, signal: abort.signal },
    );
    const rejected = assert.rejects(
      pending,
      failure ? /first failure/ : /cancelled/,
    );
    await Promise.all([first.promise, second.promise]);
    if (failure) trigger.resolve();
    else abort.abort();
    await rejected;
    assert.deepEqual(seen, [0, 1]);
    assert.equal(downstream, 0);
    assert.deepEqual(
      history
        .latest()
        .steps.batch.collection!.items.slice(2)
        .map((item) => item.status),
      [failure ? "blocked" : "cancelled", failure ? "blocked" : "cancelled"],
    );
    const finished = JSON.stringify(history.latest());
    late.resolve();
    trigger.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(JSON.stringify(history.latest()), finished);
  }
});

test("a failed map inside a parallel lane preserves the original failure when siblings are cancelled", async () => {
  const siblingStarted = deferred();
  const failure = new TypeError("item failed");
  const visited: number[] = [];
  let continued = false;
  const flow = defineJevFlow("parallel-map-failure", (f) => {
    f.parallel("lanes", {
      mapped: (lane) =>
        lane.map(
          "batch",
          { items: [0, 1], input: null, maxItems: 2, concurrency: 1 },
          (item) =>
            item.task("fail", {
              input: item.input.get("item"),
              run: async (index) => {
                visited.push(index);
                await siblingStarted.promise;
                throw failure;
              },
            }),
        ),
      waiting: (lane) =>
        lane.task("wait", {
          input: null,
          run: () => {
            siblingStarted.resolve();
            return new Promise<null>(() => {});
          },
        }),
    });
    f.task("after", {
      input: null,
      run: () => {
        continued = true;
        return null;
      },
    });
    return f.output("done");
  });
  const history = recording();
  await assert.rejects(
    flow.run(null, { client, devtools: history.observer }),
    (error) => error === failure,
  );
  assert.deepEqual(visited, [0]);
  assert.equal(continued, false);
  const run = history.latest();
  assert.equal(run.status, "error");
  assert.equal(run.error, "TypeError");
  assert.equal(run.steps.lanes.status, "error");
  assert.equal(run.steps.batch.status, "error");
  assert.equal(run.steps.wait.status, "cancelled");
  assert.equal(run.steps.after.status, "blocked");
});

test("map validates its bounds and scopes before execution and enforces the expanded-step budget", async () => {
  for (const config of [
    { maxItems: 0 },
    { maxItems: 65 },
    { maxItems: 2, concurrency: 0 },
    { maxItems: 2, concurrency: 17 },
  ]) {
    assert.throws(() =>
      defineJevFlow("invalid", (f) =>
        f.output(
          "done",
          f.map("batch", { items: [1], input: {}, ...config }, (item) =>
            item.input.get("item"),
          ),
        ),
      ),
    );
  }
  assert.throws(
    () =>
      defineJevFlow("scope", (f) =>
        f.output(
          "done",
          f.map("batch", { items: [1], input: {}, maxItems: 1 }, (item) =>
            item.task("bad", { input: f.input, run: (x) => x }),
          ),
        ),
      ),
    /Foreign/,
  );
  assert.throws(
    () =>
      defineJevFlow("nested", (f) =>
        f.output(
          "done",
          f.map("outer", { items: [1], input: {}, maxItems: 1 }, (item) =>
            item.map(
              "inner",
              { items: [2], input: {}, maxItems: 1 },
              (inner) => inner.input,
            ),
          ),
        ),
      ),
    /Nested maps/,
  );
  assert.throws(
    () =>
      defineJevFlow("wrong builder", (f) => {
        const values = f.map(
          "batch",
          { items: [1], input: {}, maxItems: 1 },
          (item) => {
            f.task("outer-write", { input: {}, run: () => null });
            return item.input;
          },
        );
        return f.output("done", values);
      }),
    /current branch or lane/,
  );
  let calls = 0;
  const flow = defineJevFlow("budget", (f) =>
    f.output(
      "done",
      f.map(
        "batch",
        { items: Array(64).fill(1) as number[], input: {}, maxItems: 64 },
        (item) => {
          for (let i = 0; i < 16; i++)
            item.task(`task-${i}`, {
              input: {},
              run: () => {
                calls++;
                return null;
              },
            });
          return item.input;
        },
      ),
    ),
  );
  await assert.rejects(flow.run({}, { client }), /1024/);
  assert.equal(calls, 0);
});

test("mapped Jev requests link to the parent run and distinct item executions through the real inspector", async () => {
  const origin = "http://localhost:5198";
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const sdk = inspector.createClient(
      {
        apiKey: "sample",
        logLevel: "off",
        compression: false,
        fetch: async (_url, init) => {
          const body = JSON.parse(String(init?.body));
          return Response.json({
            model: "synthetic",
            answers: { yes: { type: "noul", noul: body.state } },
          });
        },
      },
      { source: "sample" },
    );
    const flow = defineJevFlow("linked", (f) =>
      f.output(
        "done",
        f.map(
          "batch",
          { items: [0.2, 0.9], input: {}, maxItems: 2 },
          (item) =>
            item
              .jev("assess", {
                state: item.input.get("item"),
                questions: { yes: noul("Yes?") },
              })
              .answer("yes").noul,
        ),
      ),
    );
    const result = await flow.run({}, { client: sdk, devtools: inspector });
    assert.deepEqual(result.value, [0.2, 0.9]);
    const read = async (path: string) => {
      const response = await inspector.handle(
        new Request(origin + "/api/jev-devtools" + path),
      );
      const reader = response.body!.getReader();
      const first = await reader.read();
      await reader.cancel();
      return JSON.parse(
        new TextDecoder().decode(first.value).split("data: ")[1].trim(),
      );
    };
    const flows = await read("/flows/events"),
      traces = (await read("/events")).traces;
    assert.equal(flows.upserts.length, 1);
    assert.equal(traces.length, 2);
    for (const item of flows.upserts[0].steps.batch.collection.items) {
      const step = item.run.steps.assess;
      const trace = traces.find((trace: any) => trace.id === step.traceId);
      assert.ok(trace);
      assert.equal(trace.flow.runId, result.runId);
      assert.equal(trace.flow.stepId, `batch/${item.index}/assess`);
      assert.equal(trace.flow.executionId, step.executionId);
    }
  } finally {
    inspector.dispose();
  }
});
