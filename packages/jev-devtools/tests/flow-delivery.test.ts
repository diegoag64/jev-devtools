import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { defineJevFlow } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import type { FlowUpdate } from "../src/flow-protocol.js";

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
const decode = (bytes: Uint8Array): FlowUpdate =>
  JSON.parse(new TextDecoder().decode(bytes).split("data: ")[1]);

function fixture(t: TestContext, limit = 50) {
  const inspector = createJevDevtools({
    enabled: true,
    origin,
    limit,
    getSession: (r) => r.headers.get("x-session")!,
  });
  t.after(() => inspector.dispose());
  const shared = defineJevFlow("shared", (f) => f.output("done", f.input));
  const other = defineJevFlow("other", (f) => f.output("done", f.input));
  const run = (session: string, marker: string, flow = shared) =>
    inspector.run(request(session), () =>
      flow.run({ session, marker }, { client, devtools: inspector }),
    );
  async function connect(session: string) {
    const response = await inspector.handle(request(session));
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    t.after(() => reader.cancel());
    const raw = async () => {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      return chunk.value!;
    };
    return {
      raw,
      next: async () => decode(await raw()),
      close: () => reader.cancel(),
    };
  }
  return { inspector, shared, other, run, connect };
}

// Contract: matching ready readers amortize one encoding without sharing mutable
// Response bytes or losing definition knowledge when a sibling disconnects.
// Existing stream tests check definitions, but never observe encoding or buffers.
test(
  "matching flow readers share encoding and own independent response buffers",
  { timeout: 5000 },
  async (t) => {
    const { run, connect } = fixture(t);
    const tabs = await Promise.all(
      Array.from({ length: 3 }, () => connect("A")),
    );
    await Promise.all(tabs.map((tab) => tab.next()));
    const encode = t.mock.method(TextEncoder.prototype, "encode");
    const first = await run("A", "first");
    const bytes = await Promise.all(tabs.map((tab) => tab.raw()));
    assert.equal(
      encode.mock.calls.filter((call) =>
        call.arguments[0]?.startsWith("event: flows\n"),
      ).length,
      1,
      "one flow serialization/encoding for the matching delivery group",
    );
    for (let i = 1; i < bytes.length; i++) {
      assert.notEqual(bytes[0].buffer, bytes[i].buffer);
      assert.deepEqual(bytes[0], bytes[i]);
    }
    bytes[0].fill(0);
    for (const chunk of bytes.slice(1)) {
      const update = decode(chunk);
      assert.deepEqual(update.order, [first.runId]);
      assert.deepEqual(update.upserts[0].value, {
        session: "A",
        marker: "first",
      });
      assert.equal(update.definitions.length, 1);
    }
    await tabs[0].close();
    const second = await run("A", "second");
    for (const tab of tabs.slice(1)) {
      const update = await tab.next();
      assert.deepEqual(
        update.definitions,
        [],
        "closing a sibling must not clear shared definition knowledge",
      );
      assert.deepEqual(
        update.upserts.map((r) => r.id),
        [second.runId],
      );
      assert.deepEqual(update.order, [second.runId, first.runId]);
    }
  },
);

// Contract: batching never substitutes another session/cursor's projection.
// The older tests exercise a stalled reader alone, not alongside fast readers
// delivering the same turn with different retained definitions and cursors.
for (const newDefinition of [false, true]) {
  test(
    `flow delivery separates sessions and cursors with ${newDefinition ? "different" : "matching"} definition knowledge`,
    { timeout: 5000 },
    async (t) => {
      const { run, connect, shared, other } = fixture(t);
      const [fast, stalled, foreign] = await Promise.all([
        connect("A"),
        connect("A"),
        connect("B"),
      ]);
      await Promise.all([fast.next(), stalled.next(), foreign.next()]);
      const a1 = await run("A", "first");
      const b1 = await run("B", "private");
      const [first, privateUpdate] = await Promise.all([
        fast.next(),
        foreign.next(),
      ]);
      assert.deepEqual(first.order, [a1.runId]);
      assert.deepEqual(privateUpdate.order, [b1.runId]);
      assert.deepEqual(privateUpdate.upserts[0].value, {
        session: "B",
        marker: "private",
      });
      const a2 = await run("A", "second", newDefinition ? other : shared);
      const second = await fast.next();
      assert.deepEqual(
        second.definitions.map((d) => d.id),
        newDefinition ? [other.definition.id] : [],
      );
      assert.deepEqual(
        second.upserts.map((r) => r.id),
        [a2.runId],
      );
      const a3 = await run("A", "third");
      // Consume the stalled reader's old queue before the next shared delivery turn.
      const queued = await stalled.next();
      assert.deepEqual(queued.order, [a1.runId]);
      assert.deepEqual(
        queued.definitions.map((d) => d.id),
        [shared.definition.id],
      );
      const [current, caughtUp] = await Promise.all([
        fast.next(),
        stalled.next(),
      ]);
      assert.deepEqual(current.definitions, []);
      assert.deepEqual(
        current.upserts.map((r) => r.id),
        [a3.runId],
      );
      assert.deepEqual(
        caughtUp.definitions.map((d) => d.id),
        newDefinition ? [other.definition.id] : [],
      );
      assert.deepEqual(
        caughtUp.upserts.map((r) => [r.id, r.value]),
        [
          [a3.runId, { session: "A", marker: "third" }],
          [a2.runId, { session: "A", marker: "second" }],
        ],
      );
      for (const update of [current, caughtUp])
        assert.deepEqual(update.order, [a3.runId, a2.runId, a1.runId]);
    },
  );
}

for (const transition of ["clear", "eviction"] as const) {
  test(
    `shared flow delivery preserves final nested state after ${transition} and reconnect`,
    { timeout: 5000 },
    async (t) => {
      const { inspector, run, connect, shared, other } = fixture(
        t,
        transition === "eviction" ? 2 : 50,
      );
      const [fast, stalled] = await Promise.all([connect("A"), connect("A")]);
      // Both initial snapshots stay queued: the stalled reader knows no definition.
      await fast.next();
      await run("A", "old");
      await fast.next();
      if (transition === "clear") {
        await inspector.handle(request("A", "/clear", "DELETE"));
      } else {
        await run("B", "retains-shared");
        await run("B", "evicts-A", other);
      }
      assert.deepEqual(await fast.next(), {
        version: 1,
        definitions: [],
        upserts: [],
        order: [],
      });
      const nested = defineJevFlow("nested", (f) =>
        f.output(
          "done",
          f.map(
            "items",
            {
              items: [0, 1, 2],
              input: null,
              maxItems: 3,
              concurrency: 2,
            },
            (item) =>
              item.task("work", {
                input: item.input.get("item"),
                run: (index) => ({ index, text: "x".repeat(16000) }),
              }),
          ),
        ),
      );
      const result = await inspector.run(request("A"), () =>
        nested.run(null, { client, devtools: inspector }),
      );
      await nextTurn();
      assert.deepEqual((await stalled.next()).order, []);
      const [delivered, catchup] = await Promise.all([
        fast.next(),
        stalled.next(),
      ]);
      assert.deepEqual(delivered, catchup);
      assert.deepEqual(delivered.order, [result.runId]);
      assert.deepEqual(
        delivered.definitions.map((d) => d.id),
        [nested.definition.id],
      );
      const final = delivered.upserts[0];
      assert.equal(final.status, "success");
      assert.equal(final.steps.items.collection!.items.length, 3);
      for (const item of final.steps.items.collection!.items) {
        assert.equal(item.run!.status, "success");
        assert.deepEqual(item.run!.steps.work.data, {
          input: item.index,
          output: { index: item.index, text: "x".repeat(16000) },
        });
      }
      assert.deepEqual(
        result.value,
        [0, 1, 2].map((index) => ({ index, text: "x".repeat(16000) })),
      );
      assert.ok(
        !delivered.definitions.some((d) => d.id === shared.definition.id),
      );
      await fast.close();
      const reconnected = await connect("A");
      assert.deepEqual(
        await reconnected.next(),
        delivered,
        "reconnect must reproduce the complete retained record",
      );
    },
  );
}
