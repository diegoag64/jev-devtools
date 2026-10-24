import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { defineJevFlow } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import { connectFlowStream, type FlowHistory } from "../src/flow-stream.js";
import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";

const origin = "http://localhost:5197";
const client = {
  systemOne(): never {
    throw new Error("Unexpected SDK request");
  },
};
const request = (session: string, path = "/flows/events", method = "GET") =>
  new Request(origin + "/api/jev-devtools" + path, {
    method,
    headers: { origin, "x-session": session },
  });

function fixture(t: TestContext, limit = 50) {
  const inspector = createJevDevtools({
    enabled: true,
    origin,
    limit,
    getSession: (r) => r.headers.get("x-session")!,
  });
  t.after(() => inspector.dispose());
  const shared = defineJevFlow("shared", (f) => f.output("done", f.input));
  const other = defineJevFlow("other-session-only", (f) => f.output("done"));
  const run = (session: string, flow = shared) =>
    inspector.run(request(session), () =>
      flow.run({ session }, { client, devtools: inspector }),
    );
  return { inspector, shared, other, run };
}

// Read the actual endpoint across transitions. The existing history helper
// cancels after its initial snapshot and cannot detect missing delta definitions.
async function reader(
  t: TestContext,
  inspector: ReturnType<typeof createJevDevtools>,
  session: string,
) {
  const response = await inspector.handle(request(session));
  assert.equal(response.status, 200);
  const stream = response.body!.getReader();
  t.after(() => stream.cancel());
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    close: () => stream.cancel(),
    async next(): Promise<FlowUpdate> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const read = async () => {
        for (;;) {
          const end = buffer.indexOf("\n\n");
          if (end >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = event
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (data) return JSON.parse(data.slice(6)) as FlowUpdate;
          } else {
            const chunk = await stream.read();
            assert.equal(
              chunk.done,
              false,
              "stream ended before the expected update",
            );
            buffer += decoder.decode(chunk.value, { stream: true });
          }
        }
      };
      try {
        return await Promise.race([
          read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Timed out waiting for flow update")),
              3000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

for (const transition of ["first use", "clear", "eviction"] as const) {
  test(`sustained flow readers receive a shared definition after ${transition}`, async (t) => {
    const { inspector, shared, other, run } = fixture(
      t,
      transition === "eviction" ? 2 : 50,
    );
    if (transition !== "first use") await run("B");
    await run("A"); // Keeps the definition alive outside B's history.
    const b = await reader(t, inspector, "B");
    const initial = await b.next();
    assert.equal(initial.order.length, transition === "first use" ? 0 : 1);
    assert.deepEqual(
      initial.definitions.map((d) => d.id),
      transition === "first use" ? [] : [shared.definition.id],
    );
    if (transition === "clear") {
      assert.equal(
        (await inspector.handle(request("B", "/clear", "DELETE"))).status,
        200,
      );
      assert.deepEqual(await b.next(), {
        version: 1,
        definitions: [],
        upserts: [],
        order: [],
      });
    } else if (transition === "eviction") {
      await run("A", other); // Evicts B's run, but A still retains shared.
      assert.deepEqual(await b.next(), {
        version: 1,
        definitions: [],
        upserts: [],
        order: [],
      });
    }
    const result = await run("B");
    const update = await b.next();
    assert.deepEqual(
      update.definitions.map((d) => d.id),
      [shared.definition.id],
      "reader must receive its missing definition",
    );
    assert.deepEqual(update.order, [result.runId]);
    assert.deepEqual(
      update.upserts.map((r) => [r.id, r.value]),
      [[result.runId, { session: "B" }]],
    );

    // A later tab sharing B's session independently needs the full snapshot.
    const secondTab = await reader(t, inspector, "B");
    const snapshot = await secondTab.next();
    assert.deepEqual(
      snapshot.definitions.map((d) => d.id),
      [shared.definition.id],
    );
    assert.deepEqual(snapshot.order, [result.runId]);
    const next = await run("B");
    for (const tab of [b, secondTab]) {
      const delta = await tab.next();
      assert.deepEqual(
        delta.definitions,
        [],
        "known definitions should not be retransmitted",
      );
      assert.deepEqual(
        delta.upserts.map((r) => r.id),
        [next.runId],
      );
      assert.deepEqual(delta.order, [next.runId, result.runId]);
    }
    await b.close();
    const reconnected = await reader(t, inspector, "B");
    const fresh = await reconnected.next();
    assert.deepEqual(
      fresh.definitions.map((d) => d.id),
      [shared.definition.id],
    );
    assert.deepEqual(
      fresh.upserts.map((r) => r.id),
      [next.runId, result.runId],
    );
  });
}

test("slow flow readers catch up across clear/reuse without losing definitions or final state", async (t) => {
  const { inspector, shared, other, run } = fixture(t);
  await run("A");
  await run("A", other);
  const b = await reader(t, inspector, "B");
  assert.deepEqual((await b.next()).order, []);
  const first = await run("B");
  await nextTurn(); // Fill the real stream queue, without reading it.
  await inspector.handle(request("B", "/clear", "DELETE"));
  await nextTurn(); // Backpressure prevents this intermediate clear from being queued.
  const last = await run("B");
  await nextTurn();
  const queued = await b.next();
  assert.deepEqual(
    queued.definitions.map((d) => d.id),
    [shared.definition.id],
  );
  assert.deepEqual(queued.order, [first.runId]);
  const caughtUp = await b.next();
  assert.deepEqual(
    caughtUp.definitions,
    [],
    "undelivered clear must not discard reader knowledge",
  );
  assert.deepEqual(caughtUp.order, [last.runId]);
  assert.deepEqual(
    caughtUp.upserts.map((r) => [r.id, r.status, r.value]),
    [[last.runId, "success", { session: "B" }]],
  );
});

function browser(t: TestContext) {
  const originals = new Map(
    ["EventSource", "requestAnimationFrame", "cancelAnimationFrame"].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
    ),
  );
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const sources: Source[] = [];
  class Source extends EventTarget {
    closed = false;
    constructor(readonly url: string) {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
    send(data: FlowUpdate) {
      this.dispatchEvent(
        new MessageEvent("flows", { data: JSON.stringify(data) }),
      );
    }
    open() {
      this.dispatchEvent(new Event("open"));
    }
  }
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: Source,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (fn: FrameRequestCallback) => {
      frames.set(++frameId, fn);
      return frameId;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (id: number) => frames.delete(id),
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => {
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    sources,
    paint() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn(0));
    },
  };
}

test("native flow reconnect discards pending updates and replaces cached definitions", (t) => {
  const { sources, paint } = browser(t);
  const histories: FlowHistory[] = [];
  const stop = connectFlowStream("/api/jev", (h) => histories.push(h));
  t.after(stop);
  const definition: FlowDefinition = {
    version: 1,
    id: "shared",
    name: "before restart",
    nodes: [],
  };
  const run: FlowRun = {
    version: 1,
    id: "old",
    definitionId: "shared",
    name: "flow",
    startedAt: 1,
    status: "success",
    steps: {},
  };
  const source = sources[0];
  source.open();
  source.send({
    version: 1,
    definitions: [definition],
    upserts: [run],
    order: [run.id],
  });
  paint();
  assert.equal(histories.length, 1);
  source.send({
    version: 1,
    definitions: [],
    upserts: [{ ...run, id: "pending" }],
    order: ["pending", "old"],
  });
  source.open(); // Native EventSource reconnect reuses the same object.
  paint();
  t.mock.timers.tick(100);
  assert.equal(
    histories.length,
    1,
    "an old queued publication must not survive reconnect",
  );
  source.send({
    version: 1,
    definitions: [{ ...definition, name: "after restart" }],
    upserts: [{ ...run, id: "new" }],
    order: ["new"],
  });
  paint();
  assert.deepEqual(
    histories.at(-1)!.runs.map((r) => r.id),
    ["new"],
  );
  assert.equal(histories.at(-1)!.definitions[0].name, "after restart");
  // Invalid updates still request a fresh connection; late events cannot publish.
  source.send({
    version: 1,
    definitions: [],
    upserts: [{ ...run, definitionId: "missing" }],
    order: ["old"],
  });
  assert.equal(source.closed, true);
  t.mock.timers.tick(1000);
  assert.equal(sources.length, 2);
  sources[1].open();
  sources[1].send({ version: 1, definitions: [], upserts: [], order: [] });
  source.open();
  source.send({
    version: 1,
    definitions: [definition],
    upserts: [run],
    order: [run.id],
  });
  paint();
  assert.deepEqual(histories.at(-1), { runs: [], definitions: [] });
  stop();
  t.mock.timers.tick(1000);
  assert.equal(sources[1].closed, true);
});
