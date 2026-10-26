import assert from "node:assert/strict";
import { test } from "node:test";
import { defineJevFlow } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";
import { parseFlowUpdate } from "../src/flow-parser.js";
import type { FlowDefinition, FlowRun } from "../src/flow-protocol.js";

const client = {
  systemOne(): never {
    throw new Error("Unexpected inference");
  },
};
const origin = "http://localhost:5197";
const request = () =>
  new Request(origin + "/api/jev-devtools/flows/events", {
    headers: { origin },
  });

async function captured(
  flow: ReturnType<typeof defineJevFlow>,
  input: unknown = null,
) {
  const inspector = createJevDevtools({ enabled: true, origin });
  try {
    await inspector.run(request(), () =>
      flow.run(input, { client, devtools: inspector }),
    );
    const response = await inspector.handle(request());
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    await reader.cancel();
    const line = new TextDecoder()
      .decode(chunk.value)
      .split("\n")
      .find((line) => line.startsWith("data: "))!;
    const wire: unknown = JSON.parse(line.slice(6));
    return parseFlowUpdate(wire, new Map(), new Map());
  } finally {
    inspector.dispose();
  }
}

test("public producers retain legacy optional fields, nested loop/map captures, and redacted JSON leaves", async () => {
  const flow = defineJevFlow("nested", (f) => {
    const loop = f.loop(
      "rounds",
      {
        initial: 0,
        input: null,
        maxIterations: 2,
        while: (state) => state.lt(2),
      },
      (round) => {
        round.map(
          "items",
          { items: [1, 2], input: null, maxItems: 2 },
          (item) =>
            item.task("copy", {
              input: item.input.get("item"),
              run: (input) => input,
            }),
        );
        return round.task("next", {
          input: round.input.get("state"),
          run: (input) => input + 1,
        });
      },
    );
    return f.output("done", loop);
  });
  const result = await captured(flow);
  const run = [...result.runs.values()][0];
  assert.equal(run.value, 2);
  assert.equal(
    run.steps.rounds.collection?.items[1].run?.steps.items.collection?.items
      .length,
    2,
  );

  // JSON capture fields are display data, never pristine executable rules/answers.
  const definition = structuredClone([...result.definitions.values()][0]);
  definition.nodes[0].conditionRule = null;
  delete definition.nodes[0].conditionCaptureWarnings;
  const old = structuredClone(run);
  delete old.captureWarnings;
  old.value = "[redacted]";
  old.steps.rounds.data = null;
  delete old.steps.rounds.captureWarnings;
  const wire = {
    version: 1,
    order: [old.id],
    definitions: [definition],
    upserts: [old],
    future: { protocol: 7 },
  };
  assert.equal(
    parseFlowUpdate(wire, new Map(), new Map()).runs.get(old.id)?.value,
    "[redacted]",
  );

  const broken = structuredClone(wire);
  const child = broken.upserts[0].steps.rounds.collection!.items[0].run!;
  child.definitionId = "wrong-template";
  assert.throws(() => parseFlowUpdate(broken, result.runs, result.definitions));
  assert.equal(
    result.runs.get(run.id),
    run,
    "failed staging must preserve the original cache",
  );
});

test("definition node budget includes nested templates and accepts the producer maximum", async () => {
  const flow = defineJevFlow("full definition", (f) => {
    for (let i = 0; i < 253; i++)
      f.task(`task-${i}`, { input: null, run: () => null });
    f.map(
      "items",
      { items: [], input: null, maxItems: 1 },
      (item) => item.input,
    );
    return f.output("done");
  });
  const parsed = await captured(flow);
  const definition = [...parsed.definitions.values()][0];
  assert.equal(definition.nodes.length, 255); // Plus the item output node = 256.
  const invalid = structuredClone(definition);
  invalid.nodes.push({ id: "extra", kind: "task", dependencies: [], path: [] });
  assert.throws(() =>
    parseFlowUpdate(
      { version: 1, definitions: [invalid], upserts: [], order: [] },
      new Map(),
      new Map(),
    ),
  );
});

test("expanded run budget accepts 1023/1024 steps and rejects 1025 before cache commit", async () => {
  const flow = defineJevFlow("full run", (f) => {
    for (let i = 0; i < 14; i++)
      f.task(`task-${i}`, { input: null, run: () => null });
    f.map(
      "items",
      {
        items: Array.from({ length: 63 }, (_, i) => i),
        input: null,
        maxItems: 64,
      },
      (item) => {
        for (let i = 0; i < 15; i++)
          item.task(`item-${i}`, { input: null, run: () => null });
        return item.input.get("item");
      },
    );
    return f.output("done");
  });
  const parsed = await captured(flow);
  const definition = [...parsed.definitions.values()][0];
  const run = [...parsed.runs.values()][0];
  assert.equal(Object.keys(run.steps).length + 63 * 16, 1024);
  const check = (d: FlowDefinition, r: FlowRun) =>
    parseFlowUpdate(
      { version: 1, definitions: [d], upserts: [r], order: [r.id] },
      new Map(),
      new Map(),
    );
  assert.equal(check(definition, run).runs.size, 1);
  const smaller = structuredClone(definition),
    smallerRun = structuredClone(run);
  smaller.nodes = smaller.nodes
    .filter((node) => node.id !== "task-0")
    .map((node) => ({
      ...node,
      dependencies: node.dependencies.filter((id) => id !== "task-0"),
    }));
  delete smallerRun.steps["task-0"];
  assert.equal(check(smaller, smallerRun).runs.size, 1);
  const larger = structuredClone(definition),
    largerRun = structuredClone(run);
  larger.nodes.push({ id: "extra", kind: "task", dependencies: [], path: [] });
  largerRun.steps.extra = {
    id: "extra",
    executionId: "extra",
    status: "waiting",
  };
  assert.throws(() => check(larger, largerRun));
});

test("collection maximum and JSON depth/width bounds match captured producer values", async () => {
  const flow = defineJevFlow("full collection", (f) =>
    f.output(
      "done",
      f.map(
        "items",
        {
          items: Array.from({ length: 64 }, (_, i) => i),
          input: null,
          maxItems: 64,
          concurrency: 16,
        },
        (item) => item.input.get("item"),
      ),
    ),
  );
  const parsed = await captured(flow);
  const definition = [...parsed.definitions.values()][0];
  const run = [...parsed.runs.values()][0];
  const apply = (r: FlowRun) =>
    parseFlowUpdate(
      { version: 1, definitions: [definition], upserts: [r], order: [r.id] },
      new Map(),
      new Map(),
    );
  assert.equal(run.steps.items.collection?.items.length, 64);
  for (const mutate of [
    (r: FlowRun) => {
      r.steps.items.collection!.items[0].index = 1;
    },
    (r: FlowRun) => {
      r.steps.items.collection!.total = 65;
    },
    (r: FlowRun) => {
      r.steps.items.collection!.concurrency = 17;
    },
    (r: FlowRun) => {
      Object.assign(
        r.steps.items.collection!.items[0].run!.steps["item-result"],
        { status: "wrong" },
      );
    },
    (r: FlowRun) => {
      r.steps.items.collection!.items[1].run!.id =
        r.steps.items.collection!.items[0].run!.id;
    },
    (r: FlowRun) => {
      r.steps.items.collection!.items[1].run!.steps["item-result"].executionId =
        r.steps.items.collection!.items[0].run!.steps[
          "item-result"
        ].executionId;
    },
  ]) {
    const invalid = structuredClone(run);
    mutate(invalid);
    assert.throws(() => apply(invalid));
  }
  const valid = structuredClone(run);
  valid.value = {
    future: [null, true, 1, "[redacted]"],
    preview: "x".repeat(64000),
  };
  assert.equal(apply(valid).runs.get(run.id), valid);
  valid.value = Array.from({ length: 150 }, () => null);
  assert.equal(apply(valid).runs.size, 1);
  valid.value.push(null);
  assert.throws(() => apply(valid));
  valid.value = Object.fromEntries(
    Array.from({ length: 256 }, (_, i) => [i, null]),
  );
  assert.equal(apply(valid).runs.size, 1);
  valid.value.extra = null;
  assert.throws(() => apply(valid));
  valid.value = null;
  for (let i = 0; i < 13; i++) valid.value = [valid.value];
  assert.equal(apply(valid).runs.size, 1);
  valid.value = [valid.value];
  assert.throws(() => apply(valid));
});

for (const count of [256, 257]) {
  test(`public producer round-trips ${count} parallel lanes sharing a predecessor`, async () => {
    const names = Array.from({ length: count }, (_, i) => `lane${i}`);
    const flow = defineJevFlow("many empty lanes", (f) => {
      const previous = f.task("previous", { input: 1, run: (input) => input });
      const lanes = Object.fromEntries(
        names.map((name) => [name, () => previous]),
      );
      const joined = f.parallel("join", lanes);
      return f.output("done", joined.lane0);
    });
    const parsed = await captured(flow);
    const definition = [...parsed.definitions.values()][0];
    const join = definition.nodes.find((node) => node.id === "join")!;
    assert.equal(definition.nodes.length, 3);
    assert.deepEqual(join.lanes, names);
    assert.deepEqual(
      join.dependencies,
      names.map(() => "previous"),
    );
    assert.equal([...parsed.runs.values()][0].value, 1);
  });
}

test("parallel joins may precede dependencies and empty lanes may reuse a predecessor", async () => {
  const flow = defineJevFlow("parallel and merge", (f) => {
    const previous = f.task("previous", { input: 1, run: (input) => input });
    const lanes = f.parallel("join", {
      first: () => previous,
      second: () => previous,
      work: (lane) =>
        lane.task("work", { input: previous, run: (input) => input + 1 }),
    });
    const selected = f.if("choose", {
      when: lanes.work.eq(2),
      then: () => lanes.first,
      else: () => lanes.second,
    });
    return f.output("done", selected);
  });
  const parsed = await captured(flow);
  assert.equal([...parsed.runs.values()][0].value, 1);
  const definition = [...parsed.definitions.values()][0];
  const run = [...parsed.runs.values()][0];
  const invalid = structuredClone(definition);
  invalid.nodes[0].dependencies = ["done"];
  assert.throws(() =>
    parseFlowUpdate(
      { version: 1, definitions: [invalid], upserts: [run], order: [run.id] },
      new Map(),
      new Map(),
    ),
  );
});
