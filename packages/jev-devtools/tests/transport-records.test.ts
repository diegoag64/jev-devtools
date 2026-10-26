import assert from "node:assert/strict";
import { test } from "node:test";
import { TraceStore } from "../src/trace-store.js";

const trace = {
  version: 1,
  id: "trace",
  session: "local",
  label: "sample",
  source: "sample",
  startedAt: 1,
  status: "pending",
  request: { model: "sample", state: {}, questions: {} },
  attempts: [],
  captureWarnings: [],
};

// Network inputs are deliberately untyped. Typed fixtures previously proved
// envelope consistency without exercising malformed records at this boundary.
for (const [name, patch] of Object.entries({
  "missing fields": { session: undefined, attempts: undefined },
  "invalid status": { status: "done" },
  "invalid timing": { durationMs: "soon" },
  "invalid attempt": { attempts: [{ number: 1, status: {} }] },
  "invalid warnings": { captureWarnings: [null] },
  "invalid flow link": { flow: { runId: "r", stepId: "s" } },
  "invalid error": { error: { name: "Error", message: [] } },
})) {
  test(`trace boundary rejects ${name} without committing the cursor or records`, () => {
    const store = new TraceStore();
    const initial = store.apply("snapshot", {
      version: 2,
      revision: 0,
      traces: [trace],
    });
    assert.throws(() =>
      store.apply("snapshot", { version: 1, traces: [{ ...trace, ...patch }] }),
    );
    assert.throws(() =>
      store.apply("delta", {
        version: 2,
        base: 0,
        revision: 1,
        order: ["trace", "new"],
        upserts: [
          { ...trace, status: "success" },
          { ...trace, id: "new", ...patch },
        ],
      }),
    );
    assert.deepEqual(
      store.apply("delta", {
        version: 2,
        base: 0,
        revision: 1,
        order: ["trace"],
        upserts: [],
      }),
      initial,
    );
  });
}

test("legacy redacted content and optional capture metadata remain inspectable", () => {
  const store = new TraceStore();
  for (const request of [
    null,
    "[redacted]",
    3,
    { model: "sample", state: {}, questions: null },
  ]) {
    const parsed = store.apply("snapshot", {
      version: 1,
      traces: [{ ...trace, request, future: { supported: true } }],
    });
    assert.deepEqual(parsed[0].capture?.request, request);
    assert.deepEqual(parsed[0].request.questions, {});
    assert.ok(parsed[0].captureWarnings.length);
    assert.deepEqual(Reflect.get(parsed[0], "future"), { supported: true });
  }
  const result = {
    model: "sample",
    answers: { score: { type: "score", score: "[redacted]" } },
  };
  const parsed = store.apply("snapshot", {
    version: 1,
    traces: [{ ...trace, result }],
  });
  assert.equal(parsed[0].result, undefined);
  assert.deepEqual(parsed[0].capture?.result, result);
  const explicit = store.apply("snapshot", {
    version: 2,
    revision: 0,
    traces: [{ ...trace, capture: { request: null, result: "removed" } }],
  });
  assert.deepEqual(explicit[0].capture, { request: null, result: "removed" });
});

for (const [name, patch] of Object.entries({
  "missing content": { request: undefined },
  "non-JSON content": { result: { number: Infinity } },
  "invalid capture metadata": { capture: { request: () => null } },
  "invalid capture envelope": { capture: null },
  "non-JSON extension": { future: { value: Infinity } },
})) {
  test(`trace boundary rejects ${name}`, () => {
    assert.throws(() =>
      new TraceStore().apply("snapshot", {
        version: 1,
        traces: [{ ...trace, ...patch }],
      }),
    );
  });
}

test("unknown fields stay bounded before Raw can serialize them", () => {
  let extra: unknown = null;
  for (let depth = 0; depth < 1000; depth++) extra = { child: extra };
  assert.throws(() =>
    new TraceStore().apply("snapshot", {
      version: 1,
      traces: [{ ...trace, future: extra }],
    }),
  );
});
