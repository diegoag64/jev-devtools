import { conditionInputs } from "../src/condition-inputs.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineJevFlow,
  FlowLoopLimitError,
  type FlowExpression,
  type FlowRun,
  type FlowObserver,
} from "../flow/index.js";
import { FlowRecorder } from "../server/flows.js";
const client = {
  systemOne: () => {
    throw new Error("Unexpected request");
  },
};
function observe() {
  let run: FlowRun;
  const devtools: FlowObserver = {
    startFlow: () => ({
      update(next) {
        run = next;
      },
      request: (_l, _t, cb) => cb(),
    }),
  };
  return {
    devtools,
    get run() {
      return run;
    },
  };
}
test("loop tests before execution, carries state sequentially, and succeeds when the last allowed iteration satisfies the condition", async () => {
  const seen: number[] = [];
  const flow = defineJevFlow<{ count: number; secret: string }>(
    "counter",
    (f) => {
      const final = f.loop(
        "count",
        {
          initial: f.input,
          input: { increment: 1 },
          while: (s) => s.get("count").lt(3),
          maxIterations: 3,
        },
        (round) =>
          round.task("advance", {
            input: round.input,
            run: ({ state, index, context }) => {
              seen.push(index);
              return { ...state, count: state.count + context.increment };
            },
          }),
      );
      const typed: FlowExpression<number> = final.get("count");
      return f.output("done", typed);
    },
  );
  for (const count of [0, 3]) {
    seen.length = 0;
    const observer = observe();
    const result = await flow.run(
      { count, secret: "hidden" },
      { client, devtools: observer.devtools },
    );
    assert.equal(result.value, 3);
    assert.deepEqual(seen, count === 0 ? [0, 1, 2] : []);
    assert.equal(observer.run.steps.count.loop?.stopReason, "condition");
    assert.equal(observer.run.steps.count.collection?.total, 3 - count);
    assert.equal(observer.run.steps.count.decision, false);
    const rule = flow.definition.nodes.find(
      (n) => n.id === "count",
    )!.conditionRule!;
    assert.equal(conditionInputs(rule, observer.run, new Map())[0].value, "3");
  }
});
test("loop limits, failures and cancellation stop continuation and retain the last completed iteration", async () => {
  for (const mode of ["limit", "error", "cancel"] as const) {
    const controller = new AbortController();
    let continued = false;
    const flow = defineJevFlow("stops", (f) => {
      const final = f.loop(
        "repeat",
        {
          initial: { count: 0 },
          input: null,
          while: (s) => s.get("count").lt(10),
          maxIterations: 2,
        },
        (r) =>
          r.task("advance", {
            input: r.input.get("state"),
            run: (state) => {
              if (state.count === 1 && mode === "error")
                throw new Error("failed iteration");
              if (state.count === 1 && mode === "cancel") controller.abort();
              return { count: state.count + 1 };
            },
          }),
      );
      f.task("after", {
        input: final,
        run: (s) => {
          continued = true;
          return s;
        },
      });
      return f.output("done", final);
    });
    const observer = observe();
    await assert.rejects(
      flow.run(null, {
        client,
        signal: controller.signal,
        devtools: observer.devtools,
      }),
      mode === "limit"
        ? FlowLoopLimitError
        : mode === "cancel"
          ? { name: "AbortError" }
          : /failed iteration/,
    );
    assert.equal(continued, false);
    assert.equal(
      observer.run.steps.repeat.collection?.items[0].status,
      "completed",
    );
    assert.equal(
      observer.run.steps.repeat.collection?.items[1].status,
      mode === "limit" ? "completed" : mode === "error" ? "error" : "cancelled",
    );
    assert.equal(
      observer.run.steps.repeat.loop?.stopReason,
      mode === "limit" ? "limit" : undefined,
    );
    assert.equal(
      observer.run.steps.after.status,
      mode === "cancel" ? "cancelled" : "blocked",
    );
  }
});
test("loop definitions reject foreign state, terminal bodies and invalid bounds before dispatch", () => {
  assert.throws(
    () =>
      defineJevFlow("scope", (f) => {
        const outer = f.task("outer", { input: 1, run: (x) => x });
        f.loop(
          "loop",
          { initial: 0, input: null, while: (s) => s.lt(2), maxIterations: 2 },
          (r) => r.task("bad", { input: outer, run: (x) => x }),
        );
        return f.output("done");
      }),
    /Foreign/,
  );
  assert.throws(
    () =>
      defineJevFlow<boolean>("gate", (f) => {
        f.loop(
          "loop",
          {
            initial: true,
            input: null,
            while: () => f.input,
            maxIterations: 2,
          },
          (r) => r.input.get("state"),
        );
        return f.output("done");
      }),
    /Loop while/,
  );
  assert.throws(
    () =>
      defineJevFlow("terminal", (f) => {
        f.loop(
          "loop",
          {
            initial: { outcome: "ok" },
            input: null,
            while: (s) => s.get("outcome").eq("ok"),
            maxIterations: 2,
          },
          (r) => r.output("early"),
        );
        return f.output("done");
      }),
    /terminal/,
  );
  for (const maxIterations of [0, 65, 1.5])
    assert.throws(
      () =>
        defineJevFlow("bound", (f) => {
          f.loop(
            "loop",
            { initial: 0, input: null, while: (s) => s.lt(2), maxIterations },
            (r) => r.input.get("state"),
          );
          return f.output("done");
        }),
      /maxIterations/,
    );
});
test("maps inside iterations share the root execution budget rather than resetting it each round", async () => {
  let calls = 0;
  const flow = defineJevFlow("budget", (f) => {
    const state = f.loop(
      "rounds",
      { initial: 0, input: null, while: (s) => s.lt(9), maxIterations: 9 },
      (r) => {
        r.map(
          "batch",
          {
            items: Array.from({ length: 64 }, (_, i) => i),
            input: null,
            maxItems: 64,
            concurrency: 4,
          },
          (item) =>
            item.task("work", {
              input: item.input.get("item"),
              run: (n) => {
                calls++;
                return n;
              },
            }),
        );
        return r.task("advance", {
          input: r.input.get("state"),
          run: (n) => n + 1,
        });
      },
    );
    return f.output("done", state);
  });
  const observer = observe();
  await assert.rejects(
    flow.run(null, { client, devtools: observer.devtools }),
    /1024 expanded steps/,
  );
  assert.equal(calls, 7 * 64);
  assert.equal(
    observer.run.steps.rounds.collection?.items.filter(
      (i) => i.status === "completed",
    ).length,
    7,
  );
  assert.equal(observer.run.steps.done.status, "blocked");
});
test("loop and nested item captures are redacted without changing the final state", async () => {
  const recorder = new FlowRecorder({
    redact: (path, value) => (path.at(-1) === "secret" ? "[redacted]" : value),
  });
  const flow = defineJevFlow("capture", (f) => {
    const result = f.loop(
      "repeat",
      {
        initial: { count: 0, secret: "private" },
        input: null,
        while: (s) => s.get("count").lt(1),
        maxIterations: 1,
      },
      (r) => {
        r.map(
          "batch",
          { items: [1], input: r.input.get("state"), maxItems: 1 },
          (item) => item.input.get("context"),
        );
        return r.task("advance", {
          input: r.input.get("state"),
          run: (s) => ({ ...s, count: s.count + 1 }),
        });
      },
    );
    return f.output("done", result);
  });
  const result = await flow.run(null, {
    client,
    devtools: {
      startFlow(d, r) {
        recorder.start(d, r, "local");
        return {
          update: (r) => recorder.update(r),
          request: (_l, _t, cb) => cb(),
        };
      },
    },
  });
  assert.deepEqual(result.value, { count: 1, secret: "private" });
  const stored = JSON.stringify(recorder.changes("local").data);
  assert.ok(!stored.includes('"private"'));
  assert.ok(stored.includes("[redacted]"));
});
