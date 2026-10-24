import { test } from "node:test";
import assert from "node:assert/strict";
import type { Fetch } from "@typesafe-ai/sdk";
import { all, any, defineJevFlow } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import type { Trace } from "../src/protocol.js";
import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";
import {
  evaluateRecordedCondition,
  whatIfAcrossRuns,
  whatIfLimits,
  whatIfThresholds,
  whatIfValues,
} from "../src/what-if.js";

// Capture keeps the first 150 entries of an array and at most 16,000
// characters of a string (server/recorder.ts), so a captured length of 150 can
// stand for any longer list and a captured string may be a prefix.
const origin = "http://localhost:5197";
// The flow makes no Jev calls; a call would fail the test.
const noCalls: Fetch = async () => {
  throw new Error("unexpected Jev call");
};
const build = () =>
  defineJevFlow<{ size: number; text: number }>("what-if-truncation", (f) => {
    const list = f.task("list", {
      input: f.input.get("size"),
      run: (size) => ({ xs: Array.from({ length: size }, (_, i) => i / size) }),
    });
    const text = f.task("text", {
      input: f.input.get("text"),
      run: (n) => ({ value: "v".repeat(n), tag: "vvv" }),
    });
    f.if("exact", {
      when: all(text.get("value").eq("vvv"), list.get("xs").get(10).gte(0)),
      then: (a) => a.input,
      else: (a) => a.input,
    });
    f.if("tagged", {
      when: text.get("tag").eq("vvv"),
      then: (a) => a.input,
      else: (a) => a.input,
    });
    f.if("tenth", {
      when: list.get("xs").get(10).gte(0),
      then: (a) => a.input,
      else: (a) => a.input,
    });
    return f.branch("long", {
      when: list.get("xs").get("length").gte(100),
      then: (p) => p.output("is-long"),
      else: (p) => p.output("is-short"),
    });
  });
type Flow = ReturnType<typeof defineJevFlow<{ size: number; text: number }>>;
async function record(sizes: number[], text = 3, flow: Flow = build()) {
  const inspector = createJevDevtools({ origin, enabled: true });
  try {
    const client = inspector.createClient(
      {
        apiKey: "sample-only",
        fetch: noCalls,
        logLevel: "off",
        retry: { maxRetries: 0 },
      },
      { source: "sample" },
    );
    for (const size of sizes)
      await flow.run({ size, text }, { client, devtools: inspector });
    const response = await inspector.handle(
      new Request(origin + "/api/jev-devtools/flows/events"),
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    const update = JSON.parse(
      new TextDecoder().decode(first.value).split("data: ")[1].trim(),
    ) as FlowUpdate;
    const definition = update.definitions.find(
      (d) => d.name === flow.definition.name,
    )!;
    const runs = update.order.map((id) =>
      update.upserts.find((r) => r.id === id)!,
    );
    return { definition, runs: runs.reverse() };
  } finally {
    inspector.dispose();
  }
}
const rule = (definition: FlowDefinition, id: string) =>
  definition.nodes.find((n) => n.id === id)!.conditionRule;
const traces = new Map<string, Trace>();
// One node's decisions only, as the panel counts them.
const only = (definition: FlowDefinition, id: string): FlowDefinition => ({
  ...definition,
  nodes: definition.nodes.filter((n) => n.id === id),
});
const replay = (
  definition: FlowDefinition,
  run: FlowRun,
  overrides?: Record<string, number>,
) =>
  evaluateRecordedCondition(
    "long",
    rule(definition, "long"),
    run,
    traces,
    overrides,
  );

test("length of a captured array cut at the 150-entry bound is unavailable", async () => {
  const { definition, runs } = await record([200, 160]);
  assert.deepEqual(
    runs.map((r) => r.steps.long.decision),
    [true, true],
    "premise: the engine saw the full lists",
  );
  for (const run of runs) {
    const data = run.steps.list.data as { output: { xs: unknown[] } };
    assert.equal(data.output.xs.length, 150, "premise: capture keeps 150");
    assert.ok(
      run.steps.list.captureWarnings?.includes(
        "Long collection truncated in capture.",
      ),
    );
    assert.equal(replay(definition, run), undefined);
    // 175 and 155 sit between the captured 150 and the real lengths: a replay
    // over the cut list would report a route change that never happens.
    assert.equal(replay(definition, run, { "long#1": 175 }), undefined);
    assert.equal(replay(definition, run, { "long#1": 155 }), undefined);
  }
  assert.deepEqual(whatIfValues(definition, runs, traces, "long#1"), []);
  assert.deepEqual(
    whatIfAcrossRuns(only(definition, "long"), runs, traces, {
      "long#1": 175,
    }),
    { evaluated: 0, unavailable: 2, changed: [] },
  );
  // Index reads below the bound are still captured exactly.
  for (const run of runs)
    assert.equal(
      evaluateRecordedCondition(
        "tenth",
        rule(definition, "tenth"),
        run,
        traces,
      ),
      true,
    );
});

test("length of an untruncated array replays, including exactly 150 entries", async () => {
  const { definition, runs } = await record([150, 120, 90]);
  assert.deepEqual(
    runs.map((r) => r.steps.list.captureWarnings),
    [[], [], []],
    "premise: nothing was cut",
  );
  assert.deepEqual(
    runs.map((r) => replay(definition, r)),
    [true, true, false],
  );
  assert.equal(replay(definition, runs[0], { "long#1": 150 }), true);
  assert.equal(replay(definition, runs[0], { "long#1": 151 }), false);
  assert.equal(replay(definition, runs[2], { "long#1": 90 }), true);
  assert.deepEqual(
    whatIfValues(definition, runs, traces, "long#1").map((v) => v.value),
    [150, 120, 90],
  );
  assert.deepEqual(
    whatIfAcrossRuns(definition, runs, traces, { "long#1": 130 }).changed.map(
      (c) => c.runId,
    ),
    [runs[1].id],
  );
  // Without capture warnings (an older capture) a full-size list may be cut.
  const older = structuredClone(runs[0]);
  delete older.steps.list.captureWarnings;
  assert.equal(replay(definition, older), undefined);
  // Below the bound the captured length is the real one, warnings or not.
  const unwarned = structuredClone(runs[1]);
  delete unwarned.steps.list.captureWarnings;
  assert.equal(replay(definition, unwarned), true);
});

const condition = (
  definition: FlowDefinition,
  id: string,
  run: FlowRun,
  overrides?: Record<string, number>,
) =>
  evaluateRecordedCondition(id, rule(definition, id), run, traces, overrides);

test("a string cut by capture is unavailable; short strings still compare", async () => {
  const cut = await record([100], 20_000);
  const [run] = cut.runs;
  const data = run.steps.text.data as { output: { value: string } };
  assert.equal(data.output.value.length, 16_000, "premise: capture cut it");
  assert.ok(
    run.steps.text.captureWarnings?.includes("Long text truncated in capture."),
  );
  assert.equal(run.steps.exact.decision, false, "premise: engine compared");
  assert.equal(condition(cut.definition, "exact", run), undefined);
  for (const value of [0.5, -1])
    assert.equal(
      condition(cut.definition, "exact", run, { "exact#1.1": value }),
      undefined,
    );
  assert.deepEqual(
    whatIfAcrossRuns(only(cut.definition, "exact"), cut.runs, traces, {
      "exact#1.1": 2,
    }),
    { evaluated: 0, unavailable: 1, changed: [] },
  );
  // Which string was cut isn't recorded, so the whole capture's strings are
  // unavailable, including the short tag beside the long value.
  assert.equal(condition(cut.definition, "tagged", run), undefined);
  // Numbers in the same capture still replay.
  assert.equal(condition(cut.definition, "long", run), true);

  const short = await record([100, 120], 3);
  assert.deepEqual(
    short.runs.map((r) => r.steps.text.captureWarnings),
    [[], []],
  );
  for (const r of short.runs) {
    assert.equal(condition(short.definition, "exact", r), true);
    assert.equal(condition(short.definition, "tagged", r), true);
    assert.equal(
      condition(short.definition, "exact", r, { "exact#1.1": 2 }),
      false,
    );
  }
  assert.deepEqual(
    whatIfAcrossRuns(only(short.definition, "exact"), short.runs, traces, {
      "exact#1.1": 2,
    }),
    {
      evaluated: 2,
      unavailable: 0,
      changed: short.runs.map((r) => ({
        runId: r.id,
        nodeId: "exact",
        recorded: true,
        replayed: false,
      })),
    },
  );
  const other = await record([100], 5);
  assert.equal(condition(other.definition, "exact", other.runs[0]), false);

  // Older captures without warnings: a full 16,000-character string may be
  // cut; shorter strings compare as captured.
  const older = structuredClone(run);
  delete older.steps.text.captureWarnings;
  assert.equal(condition(cut.definition, "exact", older), undefined);
  assert.equal(condition(cut.definition, "tagged", older), true);
  const olderShort = structuredClone(short.runs[0]);
  delete olderShort.steps.text.captureWarnings;
  assert.equal(condition(short.definition, "exact", olderShort), true);
});

// Rule literals: capture cuts them like any string, and drops the rule's
// warnings. `fillers` long literals spend the rule budget before `last`.
const literalFlow = (fillers: number, last: string) =>
  defineJevFlow<{ size: number; text: number }>("what-if-literals", (f) => {
    const task = f.task("label", {
      input: f.input.get("text"),
      run: (n) => ({ label: "c".repeat(n), score: 0 }),
    });
    const label = task.get("label");
    return f.branch("gate", {
      when: all(
        any(
          ...Array.from({ length: fillers }, () =>
            label.eq("f".repeat(15_000)),
          ),
          task.get("score").gte(-1),
        ),
        // Before the literal, so the cut doesn't also take the threshold.
        task.get("score").gte(1),
        label.eq(last),
      ),
      then: (p) => p.output("yes"),
      else: (p) => p.output("no"),
    });
  });
const literalOf = (definition: FlowDefinition) =>
  (
    rule(definition, "gate") as {
      args: { args: unknown[] }[];
    }
  ).args[2].args[1] as { value: string };
// The engine takes else (the label differs from the literal). Over the cut
// literal the label would match, so a lowered threshold would report then.
async function assertCutLiteral(text: number, flow: Flow) {
  const { definition, runs } = await record([100], text, flow);
  const [run] = runs;
  assert.equal(run.outcome, "no", "premise: engine took else");
  assert.equal(literalOf(definition).value, "c".repeat(text), "premise: cut");
  assert.equal(condition(definition, "gate", run), undefined);
  for (const value of [0, -5, 1])
    assert.equal(
      condition(definition, "gate", run, { "gate#1.1": value }),
      undefined,
    );
  assert.deepEqual(
    whatIfAcrossRuns(definition, runs, traces, { "gate#1.1": 0 }),
    { evaluated: 0, unavailable: 1, changed: [] },
  );
  assert.deepEqual(whatIfLimits(rule(definition, "gate"), definition), [
    "rule",
  ]);
  // Thresholds stay listed, as for other truncated rules.
  assert.ok(whatIfThresholds(definition).some((t) => t.id === "gate#1.1"));
}

test("a rule literal at the 16,000-character cut is unavailable", async () => {
  await assertCutLiteral(16_000, literalFlow(0, "c".repeat(16_000) + "b"));
});

test("a rule literal cut short by the rule budget is unavailable", async () => {
  const flow = () => literalFlow(6, "c".repeat(9_000));
  // Learn the cut length from a first capture, then make the label match it.
  const probe = await record([100], 3, flow());
  const length = literalOf(probe.definition).value.length;
  assert.ok(length > 0 && length < 9_000, `premise: budget cut (${length})`);
  await assertCutLiteral(length, flow());
});

test("short rule literals and long untouched ones still replay", async () => {
  const flow = () => literalFlow(6, "ccc");
  const { definition, runs } = await record([100, 100], 3, flow());
  assert.deepEqual(whatIfLimits(rule(definition, "gate"), definition), []);
  for (const run of runs) {
    assert.equal(run.outcome, "no");
    assert.equal(condition(definition, "gate", run), false);
    assert.equal(condition(definition, "gate", run, { "gate#1.1": 0 }), true);
  }
  const other = await record([100], 4, flow());
  assert.equal(
    condition(other.definition, "gate", other.runs[0], { "gate#1.1": 0 }),
    false,
  );
});

test("a reference whose captured path was cut is left out of the strip", async () => {
  // The key is 16,001 characters; rule capture cuts the path entry to 16,000,
  // which names the neighbouring key holding 9.
  const key = "k".repeat(16_000) + "z";
  const flow = defineJevFlow<{ size: number; text: number }>(
    "what-if-cut-path",
    (f) => {
      const task = f.task("values", {
        input: f.input.get("size"),
        run: (): Record<string, number> => ({
          [key]: 0,
          ["k".repeat(16_000)]: 9,
        }),
      });
      return f.branch("gate", {
        when: task.get(key).gte(1),
        then: (p) => p.output("yes"),
        else: (p) => p.output("no"),
      });
    },
  );
  const { definition, runs } = await record([100], 3, flow);
  const ref = (rule(definition, "gate") as { args: { path: string[] }[] })
    .args[0];
  assert.equal(ref.path[0], "k".repeat(16_000), "premise: path entry cut");
  assert.equal(runs[0].outcome, "no", "premise: engine read 0");
  assert.deepEqual(whatIfValues(definition, runs, traces, "gate#1"), []);
  assert.equal(condition(definition, "gate", runs[0]), undefined);
  assert.equal(
    condition(definition, "gate", runs[0], { "gate#1": 5 }),
    undefined,
  );
});
