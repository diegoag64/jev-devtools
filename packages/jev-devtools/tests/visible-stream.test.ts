import assert from "node:assert/strict";
import { test } from "node:test";
import { connectFlowStream } from "../src/flow-stream.js";
import { connectTraceStream } from "../src/trace-stream.js";

test("hidden pages cancel streams, publications and retries; restoration starts fresh subscriptions", (t) => {
  const names = [
    "window",
    "document",
    "EventSource",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  const previous = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  t.after(() =>
    names.forEach((name, index) => {
      if (previous[index])
        Object.defineProperty(globalThis, name, previous[index]!);
      else Reflect.deleteProperty(globalThis, name);
    }),
  );
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    visibilityState: "hidden",
  });
  const sources: Source[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let frame = 0;
  class Source extends EventTarget {
    closed = false;
    constructor(readonly url: string) {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
    send(type: string, data: unknown) {
      this.dispatchEvent(
        new MessageEvent(type, { data: JSON.stringify(data) }),
      );
    }
  }
  const globals = {
    window: page,
    document,
    EventSource: Source,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frame, callback);
      return frame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  for (const [name, value] of Object.entries(globals))
    Object.defineProperty(globalThis, name, { configurable: true, value });
  const updates: unknown[] = [];
  const stopTrace = connectTraceStream(
    "/inspector",
    (next) => updates.push(next),
    () => {},
  );
  const stopFlow = connectFlowStream("/inspector", (next) =>
    updates.push(next),
  );
  const visible = (value: string) => {
    document.visibilityState = value;
    document.dispatchEvent(new Event("visibilitychange"));
  };
  assert.equal(
    sources.length,
    0,
    "Mounting in a hidden page consumes no stream connections",
  );
  visible("visible");
  visible("visible");
  assert.equal(
    sources.length,
    2,
    "Repeated visibility events cannot duplicate streams",
  );
  sources[0].send("snapshot", { version: 2, revision: 1, traces: [] });
  sources[1].send("flows", {
    version: 1,
    definitions: [],
    upserts: [],
    order: [],
  });
  assert.equal(frames.size, 2);
  visible("hidden");
  t.mock.timers.tick(2000);
  assert.ok(sources.every((source) => source.closed));
  assert.equal(frames.size, 0);
  assert.deepEqual(
    updates,
    [],
    "Hidden pages cannot publish a queued stale snapshot",
  );
  visible("visible");
  assert.equal(sources.length, 4);
  sources[2].send("snapshot", {});
  sources[3].send("flows", {});
  page.dispatchEvent(new Event("pagehide"));
  visible("visible");
  t.mock.timers.tick(2000);
  assert.equal(sources.length, 4, "Page exit cancels retries until pageshow");
  page.dispatchEvent(new Event("pageshow"));
  page.dispatchEvent(new Event("pageshow"));
  assert.equal(
    sources.length,
    6,
    "Restoration starts one fresh pair of subscriptions",
  );
  sources[0].send("snapshot", { version: 2, revision: 2, traces: [] });
  sources[1].send("flows", {
    version: 1,
    definitions: [],
    upserts: [],
    order: [],
  });
  t.mock.timers.tick(100);
  assert.deepEqual(
    updates,
    [],
    "Retired sources cannot publish after restoration",
  );
  sources[4].send("snapshot", { version: 2, revision: 100, traces: [] });
  sources[5].send("flows", {
    version: 1,
    definitions: [],
    upserts: [],
    order: [],
  });
  t.mock.timers.tick(100);
  assert.deepEqual(updates, [[], { runs: [], definitions: [] }]);
  page.dispatchEvent(new Event("beforeunload"));
  assert.ok(
    sources.every((source) => source.closed),
    "Refresh releases connections before fetching the next document",
  );
  t.mock.timers.tick(1000);
  assert.equal(
    sources.length,
    8,
    "A surviving document resumes after cancelled navigation",
  );
  page.dispatchEvent(new Event("beforeunload"));
  page.dispatchEvent(new Event("pagehide"));
  t.mock.timers.tick(2000);
  assert.equal(
    sources.length,
    8,
    "An exited document cannot reconnect from its navigation timer",
  );
  page.dispatchEvent(new Event("pageshow"));
  assert.equal(sources.length, 10);
  page.dispatchEvent(new Event("beforeunload"));
  stopTrace();
  stopFlow();
  visible("hidden");
  visible("visible");
  page.dispatchEvent(new Event("pageshow"));
  page.dispatchEvent(new Event("beforeunload"));
  t.mock.timers.tick(2000);
  assert.equal(
    sources.length,
    10,
    "Unmount removes all page lifecycle listeners",
  );
  assert.ok(sources.every((source) => source.closed));
});
