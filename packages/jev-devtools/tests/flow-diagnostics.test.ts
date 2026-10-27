import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defineJevFlow,
  FlowLoopLimitError,
  type FlowBuilder,
  type FlowRun,
} from "../flow/index.js";

const client = {
  systemOne() {
    throw new Error("Unexpected inference");
  },
};

test("loop exhaustion identifies the failing step without capturing its message or values", async () => {
  const runs: FlowRun[] = [];
  const flow = defineJevFlow<{ secret: string }>("diagnostic-probe", (f) => {
    f.loop(
      "already-done",
      { initial: 2, input: null, while: (s) => s.lt(2), maxIterations: 1 },
      (r) => r.input.get("state"),
    );
    const selected = f.if("select", {
      when: f.input.get("secret").eq("private-input"),
      then: (path) =>
        path.loop(
          "retry-check",
          {
            initial: { count: 0, secret: f.input.get("secret") },
            input: null,
            while: (s) => s.get("count").lt(2),
            maxIterations: 1,
          },
          (r) =>
            r.task("advance", {
              input: r.input.get("state"),
              run: (s) => ({ ...s, count: s.count + 1 }),
            }),
        ),
      else: (path) => path.input,
    });
    return f.output("done", selected);
  });
  await assert.rejects(
    flow.run(
      { secret: "private-input" },
      {
        client,
        devtools: {
          startFlow: () => ({
            update: (run) => {
              runs.push(run);
            },
            request: (_link, _trace, invoke) => invoke(),
          }),
        },
      },
    ),
    (error) => {
      assert.ok(error instanceof FlowLoopLimitError);
      assert.equal(error.stepId, "retry-check");
      assert.equal(
        error.message,
        'Loop "retry-check" condition is still true at maxIterations',
      );
      assert.ok(!error.message.includes("private-input"));
      return true;
    },
  );
  const last = runs.at(-1)!;
  assert.equal(last.error, "FlowLoopLimitError");
  assert.equal(last.steps["retry-check"].error, "FlowLoopLimitError");
  assert.equal(last.steps["retry-check"].loop?.stopReason, "limit");
  assert.equal(last.steps["retry-check"].collection?.total, 1);
  assert.equal(last.steps.done.status, "blocked");
  for (const run of runs) {
    // Error fields, unlike separately redacted data captures, must contain no values or messages.
    for (const error of [
      run.error,
      ...Object.values(run.steps).map((step) => step.error),
    ])
      if (error !== undefined) assert.equal(error, "FlowLoopLimitError");
  }
  const legacy = new FlowLoopLimitError();
  assert.ok(legacy instanceof Error);
  assert.equal(legacy.name, "FlowLoopLimitError");
  assert.equal(legacy.message, "Loop condition is still true at maxIterations");
  assert.equal(legacy.stepId, undefined);
});

for (const context of ["map", "loop", "if"] as const) {
  for (const operation of ["output", "branch"] as const) {
    test(`${context} rejects terminal ${operation} at the call with its context`, () => {
      let reachedAfterTerminal = false;
      const body = (b: FlowBuilder<unknown>) => {
        if (operation === "output") b.output("terminal", "private-output");
        else
          b.branch("terminal", {
            when: b.task("predicate", { input: true, run: (value) => value }),
            then: (p) => p.output("yes"),
            else: (p) => p.output("no"),
          });
        reachedAfterTerminal = true;
        return b.input;
      };
      assert.throws(
        () =>
          defineJevFlow<null>("private-flow-name", (f) => {
            if (context === "map")
              f.map("batch", { items: [1], input: null, maxItems: 1 }, body);
            else if (context === "loop")
              f.loop(
                "retry",
                {
                  initial: 0,
                  input: null,
                  while: (s) => s.lt(1),
                  maxIterations: 1,
                },
                (r) => {
                  body(r as FlowBuilder<unknown>);
                  return r.input.get("state");
                },
              );
            else
              f.if("choose", {
                when: f.input.eq(null),
                then: body,
                else: (p) => p.input,
              });
            return f.output("done");
          }),
        {
          name: "Error",
          message: `${context === "map" ? 'map "batch" body' : context === "loop" ? 'loop "retry" body' : 'if "choose" then path'} does not support terminal ${operation}(); return a value expression instead`,
        },
      );
      assert.equal(reachedAfterTerminal, false);
    });
  }
}

test("nested if and map diagnostics identify the immediate value-returning context", () => {
  for (const nested of ["if", "map"] as const) {
    assert.throws(
      () =>
        defineJevFlow("nested", (f) => {
          f.loop(
            "rounds",
            {
              initial: 0,
              input: null,
              while: (s) => s.lt(1),
              maxIterations: 1,
            },
            (r) => {
              if (nested === "if")
                r.if("choose", {
                  when: r.input.get("state").eq(0),
                  then: (p) => p.input,
                  else: (p) => p.output("bad"),
                });
              else
                r.map(
                  "batch",
                  { items: [1], input: null, maxItems: 1 },
                  (item) => item.output("bad"),
                );
              return r.input.get("state");
            },
          );
          return f.output("done");
        }),
      {
        message: `${nested === "if" ? 'if "choose" else path' : 'map "batch" body'} does not support terminal output(); return a value expression instead`,
      },
    );
  }
});

test("parallel lanes still return terminal outputs and branches inside map, loop and if bodies", async () => {
  const terminals = (b: FlowBuilder<unknown>) => {
    const when = b.task("predicate", { input: true, run: (value) => value });
    return b.parallel("lanes", {
      direct: (lane) => lane.output("lane-output", 1),
      decision: (lane) =>
        lane.branch("lane-branch", {
          when,
          then: (p) => p.output("yes", 2),
          else: (p) => p.output("no", 3),
        }),
    });
  };
  for (const context of ["map", "loop", "if"] as const) {
    const flow = defineJevFlow<null>("lanes", (f) => {
      if (context === "map")
        return f.output(
          "done",
          f.map(
            "batch",
            { items: [1], input: null, maxItems: 1 },
            (item) => terminals(item as FlowBuilder<unknown>).direct,
          ),
        );
      if (context === "if")
        return f.output(
          "done",
          f.if("choose", {
            when: f.input.eq(null),
            then: (p) => terminals(p).decision,
            else: (p) => p.input,
          }),
        );
      const state = f.loop(
        "retry",
        { initial: 0, input: null, while: (s) => s.lt(1), maxIterations: 1 },
        (r) => {
          terminals(r as FlowBuilder<unknown>);
          return r.task("advance", {
            input: r.input.get("state"),
            run: (n) => n + 1,
          });
        },
      );
      return f.output("done", state);
    });
    const result = await flow.run(null, { client });
    assert.deepEqual(
      result.value,
      context === "map"
        ? [{ outcome: "lane-output", value: 1 }]
        : context === "if"
          ? { outcome: "yes", value: 2 }
          : 1,
    );
  }
});
