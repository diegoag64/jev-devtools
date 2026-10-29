import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Image, noul, withAssets } from "@typesafe-ai/sdk";
import {
  createJevDevtools,
  type CaptureOptions,
  type CaptureContext,
} from "jev-devtools/server";
import { defineJevFlow, type FlowRun } from "jev-devtools/flow";

const origin = "http://localhost:5196";
type Adapter = ReturnType<typeof createJevDevtools>;
async function snapshot(adapter: Adapter, path = "/flows/events") {
  const response = await adapter.handle(
    new Request(origin + "/api/jev-devtools" + path),
  );
  const reader = response.body!.getReader();
  try {
    return JSON.parse(
      new TextDecoder().decode((await reader.read()).value).split("data: ")[1],
    );
  } finally {
    await reader.cancel();
  }
}
const response = {
  model: "fixture",
  answers: { ok: { type: "noul", noul: 0.8 } },
  state: "same",
};
const clientOptions = {
  apiKey: "sample",
  logLevel: "off" as const,
  fetch: async () => Response.json(response),
};

// The old suite redacted leaf names across all captures. Identical paths and
// values at different capture boundaries require the third callback argument.
for (const policy of ["context", "legacy"] as const) {
  test(`request/task-shaped outcome collisions preserve ${policy} policy over SSE`, async (t) => {
    const calls: {
      path: string[];
      kind: CaptureContext["kind"];
      value: unknown;
      frozen: boolean;
    }[] = [];
    const legacy = (path: string[], value: unknown) =>
      path.join(".") === "state" || path.join(".") === "steps.work.data.output"
        ? "legacy"
        : value;
    const redact: CaptureOptions["redact"] = (path, value, context) => {
      calls.push({
        path: [...path],
        value,
        kind: context.kind,
        frozen: Object.isFrozen(context),
      });
      if (policy === "legacy") return legacy(path, value);
      if (
        path.join(".") === "state" ||
        path.join(".") === "steps.work.data.output"
      )
        return context.kind;
      return value;
    };
    const inspector = createJevDevtools({ origin, enabled: true, redact });
    t.after(() => inspector.dispose());
    const client = inspector.createClient(clientOptions);
    const flow = defineJevFlow("collisions", (f) => {
      f.jev("request", { state: "same", questions: { ok: noul("OK?") } });
      const work = f.task("work", { input: null, run: () => "same" });
      return f.output("done", {
        state: "same",
        steps: { work: { data: { output: work } } },
      });
    });
    assert.deepEqual(
      (await flow.run({}, { client, devtools: inspector })).value,
      { state: "same", steps: { work: { data: { output: "same" } } } },
    );
    await nextTurn();
    const [trace] = (await snapshot(inspector, "/events")).traces;
    const [run] = (await snapshot(inspector)).upserts;
    assert.equal(
      trace.request.state,
      policy === "legacy" ? "legacy" : "request",
    );
    assert.equal(
      trace.result.state,
      policy === "legacy" ? "legacy" : "response",
    );
    assert.equal(
      run.steps.work.data.output,
      policy === "legacy" ? "legacy" : "step-data",
    );
    assert.equal(run.value.state, policy === "legacy" ? "legacy" : "outcome");
    assert.deepEqual(trace.captureFidelity, {
      request: "modified",
      result: "modified",
    });
    assert.equal(run.steps.work.captureFidelity, "modified");
    assert.equal(run.captureFidelity, "modified");
    assert.equal(
      run.value.steps.work.data.output,
      policy === "legacy" ? "legacy" : "outcome",
    );
    for (const [path, kinds] of [
      ["state", ["request", "response", "outcome"]],
      ["steps.work.data.output", ["step-data", "outcome"]],
    ] as const)
      assert.deepEqual(
        new Set(
          calls.filter((c) => c.path.join(".") === path).map((c) => c.kind),
        ),
        new Set(kinds),
      );
    assert.ok(calls.every((c) => c.frozen));
    const count = calls.length;
    assert.deepEqual((await snapshot(inspector)).upserts[0], run);
    assert.equal(
      calls.length,
      count,
      "reading retained snapshots does not rerun redaction",
    );
  });
}

test("loop, merge, nested map rules/data/outcomes keep their documented path and kind", async (t) => {
  const calls = new Set<string>();
  const inspector = createJevDevtools({
    origin,
    enabled: true,
    redact: (path, value, context) => {
      calls.add(context.kind + ":" + path.join("/"));
      return path.at(-1) === "value" && context.kind === "condition-rule"
        ? "rule-only"
        : value;
    },
  });
  t.after(() => inspector.dispose());
  const flow = defineJevFlow("nested-context", (f) => {
    const result = f.loop(
      "loop",
      { initial: 0, input: null, while: (s) => s.lt(1), maxIterations: 1 },
      (round) => {
        round.map("map", { items: [1], input: null, maxItems: 1 }, (item) => {
          item.jev("request", {
            state: { marker: 1 },
            questions: { ok: noul("OK?") },
          });
          return item.if("choose", {
            when: item.input.get("item").eq(1),
            then: (yes) => yes.task("work", { input: 1, run: (n) => n }),
            else: (no) => no.task("other", { input: 0, run: (n) => n }),
          });
        });
        return round.task("advance", {
          input: round.input.get("state"),
          run: (n) => n + 1,
        });
      },
    );
    return f.output("done", result);
  });
  const client = inspector.createClient(clientOptions);
  assert.equal((await flow.run({}, { client, devtools: inspector })).value, 1);
  await nextTurn();
  const history = await snapshot(inspector);
  const root = history.upserts[0];
  const round = root.steps.loop.collection.items[0].run;
  const item = round.steps.map.collection.items[0].run;
  assert.equal(item.steps.choose.decision, true);
  const merge = history.definitions[0].nodes
    .find((n: any) => n.id === "loop")
    .itemDefinition.nodes.find((n: any) => n.id === "map")
    .itemDefinition.nodes.find((n: any) => n.kind === "merge").id;
  for (const entry of [
    "request:state/marker",
    "response:answers/ok/noul",
    "condition-rule:conditions/loop/args/1/value",
    "condition-rule:conditions/loop/items/map/items/choose/args/1/value",
    "step-data:steps/loop/data/output",
    "step-data:steps/loop/items/0/steps/map/items/0/steps/work/data/output",
    `step-data:steps/loop/items/0/steps/map/items/0/steps/${merge}/data/output`,
    "outcome:steps/loop/items/0/steps/map/items/0",
    "outcome:steps/loop/items/0",
    "outcome:",
  ])
    assert.ok(calls.has(entry), entry);
  const count = calls.size;
  await flow.run({}, { client, devtools: inspector });
  await nextTurn();
  assert.equal(
    calls.size,
    count,
    "reused definitions and nested runs retain the same path/kind contract",
  );
});

// Public observer producers may reuse detached JSON objects and immutable child
// snapshots. Identity alone must not reuse a different path's policy result.
test("reused data and child snapshots apply each path policy and keep source snapshots pristine", async (t) => {
  const calls: string[] = [];
  const inspector = createJevDevtools({
    origin,
    enabled: true,
    redact: (path, value, context) => {
      calls.push(context.kind + ":" + path.join("/"));
      if (context.kind === "step-data" && path.at(-1) === "data") {
        (value as { output: string }).output = path.join("/");
      }
      if (
        context.kind === "outcome" &&
        value &&
        typeof value === "object" &&
        "output" in value
      )
        (value as { output: string }).output += "!";
      return value;
    },
  });
  t.after(() => inspector.dispose());
  const data = { output: "original" };
  const step = (id: string) => ({
    id,
    executionId: id,
    status: "completed" as const,
    data,
  });
  const child: FlowRun = {
    version: 1,
    id: "child",
    definitionId: "child",
    name: "child",
    startedAt: 0,
    status: "success",
    steps: { work: step("work") },
    value: data,
  };
  const run: FlowRun = {
    version: 1,
    id: "root",
    definitionId: "root",
    name: "root",
    startedAt: 0,
    status: "success",
    steps: {
      first: step("first"),
      second: step("second"),
      map: {
        id: "map",
        executionId: "map",
        status: "completed",
        collection: {
          total: 2,
          concurrency: 1,
          items: [0, 1].map((index) => ({
            index,
            status: "completed",
            run: child,
          })),
        },
      },
    },
    value: data,
  };
  const observer = inspector.startFlow(
    { version: 1, id: "root", name: "root", nodes: [] },
    { ...run, steps: {}, value: undefined },
  )!;
  observer.update(run);
  observer.update(run);
  const stored = (await snapshot(inspector)).upserts[0];
  assert.deepEqual(data, { output: "original" });
  assert.equal(stored.value.output, "original!");
  for (const id of ["first", "second"]) {
    assert.equal(stored.steps[id].data.output, `steps/${id}/data`);
    assert.equal(stored.steps[id].captureFidelity, "unknown");
    assert.deepEqual(stored.steps[id].captureWarnings, []);
  }
  for (const index of [0, 1]) {
    const item = stored.steps.map.collection.items[index].run;
    assert.equal(
      item.steps.work.data.output,
      `steps/map/items/${index}/steps/work/data`,
    );
    assert.equal(item.value.output, "original!");
    assert.equal(item.steps.work.captureFidelity, "unknown");
    assert.equal(item.captureFidelity, "unknown");
    assert.equal(
      calls.filter(
        (p) => p === `step-data:steps/map/items/${index}/steps/work/data`,
      ).length,
      1,
    );
  }
  const second = { ...run, id: "second-run" };
  inspector
    .startFlow(
      { version: 1, id: "root", name: "root", nodes: [] },
      { ...second, steps: {}, value: undefined },
    )!
    .update(second);
  assert.deepEqual((await snapshot(inspector)).upserts[0].steps, stored.steps);
});

for (const throws of [false, true]) {
  test(`request callback mutations${throws ? " and exceptions" : ""} leave SDK inputs and results intact`, async (t) => {
    let sent: unknown;
    const contexts: CaptureContext[] = [];
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: (path, value, context) => {
        contexts.push(context);
        if (context.kind === "request" && path.join(".") === "state") {
          (value as { count: number }).count = 77;
          path.push("secret");
          if (throws) throw new Error("private redactor error");
        }
        return value;
      },
    });
    t.after(() => inspector.dispose());
    const input = {
      state: { count: 1, apiKey: "private-key" },
      questions: { ok: noul("OK?") },
    };
    const client = inspector.createClient({
      ...clientOptions,
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return Response.json(response);
      },
    });
    assert.equal((await client.systemOne(input)).answers.ok.noul, 0.8);
    await nextTurn();
    assert.deepEqual((sent as { state: unknown }).state, input.state);
    assert.equal(input.state.count, 1);
    const [trace] = (await snapshot(inspector, "/events")).traces;
    assert.equal(trace.status, "success");
    assert.doesNotMatch(
      JSON.stringify(trace),
      /private-key|private redactor error/,
    );
    if (!throws)
      assert.deepEqual(trace.request.state, {
        count: 77,
        apiKey: "[redacted]",
      });
    else
      assert.ok(
        trace.captureWarnings.includes(
          "Input snapshot failed; request continues normally.",
        ),
      );
    assert.ok(
      contexts.every(
        (c) => Object.isFrozen(c) && !Reflect.set(c, "kind", "outcome"),
      ),
    );
  });
}

for (const storage of ["bytes", "shared", "blob"] as const) {
  test(`custom redaction detaches SDK images with ${storage} storage and preserves withAssets references`, async (t) => {
    const bytes = new Uint8Array(
      storage === "shared" ? new SharedArrayBuffer(8) : new ArrayBuffer(8),
    );
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const photo = new Image(
      storage === "blob" ? new Blob([Uint8Array.from(bytes)]) : bytes,
    );
    const ref = String(photo);
    const seen: string[] = [];
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: (path, value, context) => {
        if (context.kind === "request" && value instanceof Image) {
          seen.push(String(value));
          if (value.data instanceof Uint8Array) value.data[2] = 0;
          else Reflect.set(value, "data", new Blob(["changed capture"]));
        }
        return value;
      },
    });
    t.after(() => inspector.dispose());
    const client = inspector.createClient({
      ...clientOptions,
      fetch: async (_url, init) => {
        const form = await new Response(init?.body as BodyInit, {
          headers: init?.headers,
        }).formData();
        const payload = JSON.parse(String(form.get("request")));
        const image = form.get(payload.assets[ref].part) as Blob;
        assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
        return Response.json(response);
      },
    });
    await client.systemOne({
      state: { text: withAssets`Look ${photo}` },
      questions: { ok: noul("OK?") },
    });
    await nextTurn();
    assert.deepEqual(seen, [ref]);
    assert.equal(bytes[2], 78);
    const [trace] = (await snapshot(inspector, "/events")).traces;
    const image = trace.request.state.text.assets[0];
    assert.equal(image.ref, ref);
    if (storage === "blob") {
      assert.equal(image.preview, undefined);
      assert.equal(image.bytes, "changed capture".length);
      assert.ok(
        trace.captureWarnings.includes(
          "Image preview omitted (Blob, unsupported format, or size limit).",
        ),
      );
    } else assert.match(image.preview, /^data:image\/png;base64,/);
  });
}
