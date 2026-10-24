import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineJevFlow,
  type FlowExpression,
  type FlowRun,
  type FlowObserver,
} from "../flow/index.js";
import {
  conditionInputs,
  conditionRequirement,
} from "../src/condition-inputs.js";
import { FlowRecorder } from "../server/flows.js";

const client = {
  systemOne: () => {
    throw new Error("Unexpected Jev request");
  },
};
function observe() {
  let run: FlowRun;
  const devtools: FlowObserver = {
    startFlow: () => ({
      update(next) {
        run = next;
      },
      request: (_link, _trace, callback) => callback(),
    }),
  };
  return {
    devtools,
    get run() {
      return run;
    },
  };
}

test("if executes one arm, rejoins once, exposes a typed union and preserves the strict gate boundary", async () => {
  const calls: string[] = [];
  const flow = defineJevFlow<{ probability: number }>("cascade", (f) => {
    const input = f.task("score", {
      input: f.input.get("probability"),
      run: (value) => value,
    });
    const selected = f.if("gate", {
      when: input.gt(0.7),
      then: (arm) =>
        arm.task("strong", {
          input: null,
          run: () => {
            calls.push("strong");
            return { route: "strong" as const, value: 42 };
          },
        }),
      else: (arm) =>
        arm.task("cheap", {
          input: null,
          run: () => {
            calls.push("cheap");
            return { route: "cheap" as const, value: "original" };
          },
        }),
    });
    const typed: FlowExpression<string | number> = selected.get("value");
    // @ts-expect-error a conditional union must not erase the other arm's type
    const wrong: FlowExpression<number> = typed;
    void wrong;
    const final = f.task("continue", {
      input: selected,
      run: (result) => {
        calls.push("continue");
        return result;
      },
    });
    return f.output("done", final);
  });
  const merge = flow.definition.nodes.find((n) => n.kind === "merge")!;
  assert.deepEqual(new Set(merge.dependencies), new Set(["strong", "cheap"]));
  for (const [probability, chosen, value] of [
    [0.7, "cheap", "original"],
    [0.70001, "strong", 42],
  ] as const) {
    calls.length = 0;
    const observer = observe();
    const result = await flow.run(
      { probability },
      { client, devtools: observer.devtools },
    );
    assert.deepEqual(calls, [chosen, "continue"]);
    assert.deepEqual(result.value, { route: chosen, value });
    assert.equal(
      observer.run.steps[chosen === "strong" ? "cheap" : "strong"].status,
      "untaken",
    );
    assert.equal(observer.run.steps[merge.id].status, "completed");
    const rule = flow.definition.nodes.find(
      (n) => n.id === "gate",
    )!.conditionRule!;
    const inputs = conditionInputs(rule, observer.run, new Map());
    assert.equal(inputs[0].value, String(probability));
    assert.equal(conditionRequirement(rule, inputs), "Greater than 0.7");
  }
});

test("if scopes prevent leaked values and terminal arms, while direct prior values and nested if/map/parallel compose", async () => {
  let leaked: FlowExpression<number>;
  assert.throws(
    () =>
      defineJevFlow<boolean>("leak", (f) => {
        f.if("gate", {
          when: f.input,
          then: (a) => (leaked = a.task("local", { input: 1, run: (x) => x })),
          else: (a) => a.task("other", { input: 0, run: (x) => x }),
        });
        return f.output("done", leaked);
      }),
    /Unavailable reference/,
  );
  assert.throws(
    () =>
      defineJevFlow<boolean>("terminal", (f) => {
        f.if("gate", {
          when: f.input,
          then: (a) => a.output("early"),
          else: (a) => a.input,
        });
        return f.output("done");
      }),
    /if paths must return a value/,
  );
  const flow = defineJevFlow("nested", (f) => {
    const lanes = f.parallel("lanes", {
      values: (lane) =>
        lane.map(
          "items",
          { items: [0, 1, 2], input: null, maxItems: 3 },
          (item) =>
            item.if("outer", {
              when: item.input.get("item").gte(1),
              then: (arm) =>
                arm.if("inner", {
                  when: arm.input.get("item").eq(2),
                  then: (a) =>
                    a.task("double", {
                      input: a.input.get("item"),
                      run: (x) => x * 2,
                    }),
                  else: (a) => a.input.get("item"),
                }),
              else: (arm) => arm.input.get("item"),
            }),
        ),
    });
    return f.output("done", lanes.values);
  });
  assert.deepEqual((await flow.run(null, { client })).value, [0, 1, 4]);
});

test("failed or cancelled if arms prevent the merge and continuation without executing the alternative", async () => {
  for (const cancel of [false, true]) {
    let continued = false;
    const controller = new AbortController();
    const flow = defineJevFlow<boolean>("failure", (f) => {
      const result = f.if("gate", {
        when: f.input,
        then: (a) =>
          a.task("fail", {
            input: null,
            run: () => {
              if (cancel) controller.abort();
              else throw new Error("failed");
              return 1;
            },
          }),
        else: (a) =>
          a.task("alternative", {
            input: null,
            run: () => {
              throw new Error("Must not run");
            },
          }),
      });
      const next = f.task("next", {
        input: result,
        run: (value) => {
          continued = true;
          return value;
        },
      });
      return f.output("done", next);
    });
    const observer = observe();
    await assert.rejects(
      flow.run(true, {
        client,
        signal: controller.signal,
        devtools: observer.devtools,
      }),
      cancel ? { name: "AbortError" } : /failed/,
    );
    assert.equal(continued, false);
    assert.equal(observer.run.steps.alternative.status, "untaken");
    assert.equal(
      observer.run.steps[
        flow.definition.nodes.find((n) => n.kind === "merge")!.id
      ].status,
      cancel ? "cancelled" : "blocked",
    );
  }
});

test("merge captures honor recorder redaction without changing downstream values", async () => {
  const recorder = new FlowRecorder({
    redact: (path, value) => (path.at(-1) === "secret" ? "[redacted]" : value),
  });
  const flow = defineJevFlow<{ take: boolean; secret: string }>(
    "capture",
    (f) => {
      const selected = f.if("gate", {
        when: f.input.get("take"),
        then: (a) => a.input,
        else: (a) => a.input,
      });
      const again = f.if("again", {
        when: selected.get("take"),
        then: () => selected,
        else: () => selected,
      });
      return f.output("done", again);
    },
  );
  const result = await flow.run(
    { take: true, secret: "private" },
    {
      client,
      devtools: {
        startFlow(definition, run) {
          recorder.start(definition, run, "local");
          return {
            update: (run) => recorder.update(run),
            request: (_l, _t, cb) => cb(),
          };
        },
      },
    },
  );
  assert.deepEqual(result.value, { take: true, secret: "private" });
  const { data } = recorder.changes("local");
  assert.ok(!JSON.stringify(data).includes('"private"'));
  const rule = data.definitions[0].nodes.find(
    (n) => n.id === "again",
  )!.conditionRule!;
  assert.equal(
    conditionInputs(rule, data.upserts[0], new Map())[0].value,
    "true",
  );
});

test("non-JSON direct-return values are preserved even when a merge snapshot is unavailable", async () => {
  const flow = defineJevFlow<{ choose: boolean; value: Date }>(
    "optional",
    (f) => {
      const result = f.if("gate", {
        when: f.input.get("choose"),
        then: (p) => p.input.get("value"),
        else: (p) => p.input.get("value"),
      });
      return f.output("done", result);
    },
  );
  const observer = observe();
  const value = new Date("2026-10-24T00:00:00Z");
  const result = await flow.run(
    { choose: true, value },
    { client, devtools: observer.devtools },
  );
  assert.equal(result.value, value);
  assert.equal(observer.run.status, "success");
  assert.equal(
    typeof observer.run.steps[
      flow.definition.nodes.find((n) => n.kind === "merge")!.id
    ].data,
    "string",
  );
});
