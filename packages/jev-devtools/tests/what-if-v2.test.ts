/**
 * What-if thresholds over the 0.4.0 flow features: if() steps, task outputs, map items and loop iterations.
 *
 * Every scenario drives a real flow through an enabled inspector and replays
 * what the drawer receives (the /flows/events and /events streams).
 *
 * Specification (engine facts this rests on are asserted in the premise test):
 *
 * 1. gt. `whatIfThresholds` lists `gt(reference, finite numeric literal)` with
 *    op "gt", like lt/gte. Replay is strict: a > b. `whatIfLimits` treats gt
 *    like lt/gte (a gt rule is not a "rule" limit by itself).
 *
 * 2. Task-derived references (`source: "task"`). The engine tags references to
 *    task, merge (flow.if result) and loop steps with `source: "task"`; their
 *    `path` is relative to the step's captured output. The value lives at
 *    `run.steps[stepId].data.output`, followed by `path` (an empty path is the
 *    output itself): task data is `{ input, output }`, merge data is
 *    `{ output }`, loop data is `{ input: initial, output: final state }`.
 *    Same "unavailable rather than guessed" rules as answers: a missing step,
 *    missing or non-object data, no own `output`, a missing/inherited key, or a
 *    capture placeholder ("[redacted]", "[truncated]", "[capture unavailable]",
 *    ...) anywhere on the path makes the rule unavailable. A task reference
 *    reads step data only, never a trace (even if the step has a traceId); a
 *    request reference (no `source`) reads its trace only, never step data.
 *
 * 3. flow.if(). Nodes of kind "if" are replayed exactly like "branch" nodes
 *    (whatIfThresholds, whatIfAcrossRuns): the engine records their decision in
 *    `steps[id].decision` the same way. Merge nodes (kind "merge") copy the if's
 *    decision but have no rule: they are never listed and never counted (not as
 *    evaluated, not as unavailable). Loop nodes also carry a conditionRule and a
 *    decision (the final, stopping evaluation of the while gate): they are NOT
 *    replayed, listed or counted, because changing a loop gate changes the
 *    number of iterations, which captured data cannot reproduce.
 *
 * 4. Item programs (flow.map / flow.loop). A map or loop node carries
 *    `itemDefinition`; every item or iteration runs as its own FlowRun under
 *    `steps[nodeId].collection.items[].run`, whose `definitionId` is
 *    `itemDefinition.id`. Item-level rules are replayed against the ITEM run:
 *    `evaluateRecordedCondition(nodeId, rule, itemRun, traces)`. Requests inside
 *    an item link through the item run's own `steps[id].traceId`; the trace's
 *    `flow` field carries the parent runId and a composed `node/index/step`
 *    stepId, and resolution never consults it. `whatIfThresholds(definition)`
 *    lists only that definition's own nodes (it does not descend into
 *    itemDefinition), and `whatIfAcrossRuns(itemDefinition, itemRuns, ...)`
 *    counts item runs like any other runs (changes carry the item run's id).
 *
 *    New export, exact semantics:
 *      whatIfItemRuns(parentRuns: readonly FlowRun[], nodeId: string): FlowRun[]
 *    For each parent run in the given order, the `run` of every entry of
 *    `steps[nodeId].collection.items`, in that array's order. Entries without a
 *    run, and parents without that step or collection, are skipped. One level
 *    only (call it again on the result for deeper programs). It does not filter
 *    by definition (whatIfAcrossRuns does), returns the recorded run objects,
 *    and never mutates or throws on captured data.
 *
 * 5. Parity. With no overrides, replay reproduces every recorded decision whose
 *    operands were captured, across all of the above.
 *
 * Existing signatures stay compatible (the 0.3.0 gate tests/what-if.test.ts
 * still runs unchanged).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { noul, type Fetch } from "@typesafe-ai/sdk";
import { defineJevFlow, all, type FlowExpression } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import type { Trace } from "../src/protocol.js";
import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";
import * as whatIf from "../src/what-if.js";
import type { WhatIfChange } from "../src/what-if.js";

// The API must never throw on captured data: a throw becomes a failed assertion.
const safely =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R | string => {
    try {
      return fn(...args);
    } catch (error) {
      return `threw: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
const evaluate = safely(whatIf.evaluateRecordedCondition);
const across = (...args: Parameters<typeof whatIf.whatIfAcrossRuns>) => {
  const result = safely(whatIf.whatIfAcrossRuns)(...args);
  assert.equal(typeof result, "object", String(result));
  return result as ReturnType<typeof whatIf.whatIfAcrossRuns>;
};
const thresholds = (definition: FlowDefinition) => {
  const result = safely(whatIf.whatIfThresholds)(definition);
  assert.ok(Array.isArray(result), String(result));
  return result as ReturnType<typeof whatIf.whatIfThresholds>;
};
const values = (...args: Parameters<typeof whatIf.whatIfValues>) => {
  const result = safely(whatIf.whatIfValues)(...args);
  assert.ok(Array.isArray(result), String(result));
  return result as ReturnType<typeof whatIf.whatIfValues>;
};
const limits = (...args: Parameters<typeof whatIf.whatIfLimits>) => {
  const result = safely(whatIf.whatIfLimits)(...args);
  assert.ok(Array.isArray(result), String(result));
  return result as ReturnType<typeof whatIf.whatIfLimits>;
};
// whatIfItemRuns is new in this port. Read it off the module namespace so this
// file loads (and every other check reports its own assertion) before it exists.
type ItemRuns = (parentRuns: readonly FlowRun[], nodeId: string) => FlowRun[];
const itemRuns = (parentRuns: readonly FlowRun[], nodeId: string) => {
  const fn = (whatIf as { whatIfItemRuns?: ItemRuns }).whatIfItemRuns;
  assert.equal(typeof fn, "function", "what-if.ts exports whatIfItemRuns");
  const result = safely(fn!)(parentRuns, nodeId);
  assert.ok(Array.isArray(result), String(result));
  return result as FlowRun[];
};

// Fixture transport: every noul answer is read back from the request state.
const origin = "http://localhost:5199";
let sent = 0;
const transport: Fetch = async (_url, init) => {
  sent++;
  const request = JSON.parse(String(init?.body));
  const state = request.state as Record<string, unknown>;
  const answers: Record<string, unknown> = {};
  for (const name of Object.keys(request.questions))
    answers[name] = { type: "noul", noul: state[name] };
  return Response.json({ model: "sample", answers });
};
const clientOptions = {
  apiKey: "sample-only",
  fetch: transport,
  logLevel: "off" as const,
  retry: { maxRetries: 0 },
};
async function stream(
  inspector: ReturnType<typeof createJevDevtools>,
  path: string,
) {
  const response = await inspector.handle(
    new Request(origin + "/api/jev-devtools" + path),
  );
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  return JSON.parse(
    new TextDecoder().decode(first.value).split("data: ")[1].trim(),
  );
}
type Flow<T> = ReturnType<typeof defineJevFlow<T>>;
type Scenario = {
  definition: FlowDefinition;
  local: FlowDefinition;
  runs: FlowRun[]; // in run order
  runIds: string[];
  outcomes: (string | undefined)[];
  traces: Map<string, Trace>;
  names: string[]; // every captured top-level definition
};
async function record<T>(
  build: () => Flow<T>,
  inputs: T[],
  redact?: (path: string[], value: unknown) => unknown,
): Promise<Scenario> {
  const inspector = createJevDevtools({ origin, enabled: true, redact });
  try {
    const client = inspector.createClient(clientOptions, { source: "sample" });
    const flow = build();
    const runIds: string[] = [];
    const outcomes: (string | undefined)[] = [];
    for (const input of inputs) {
      const before = new Set(
        ((await stream(inspector, "/flows/events")) as FlowUpdate).order,
      );
      try {
        const result = await flow.run(input, { client, devtools: inspector });
        runIds.push(result.runId);
        outcomes.push(result.outcome);
      } catch {
        // A failed run is still recorded; find it by its new id.
        const after = ((await stream(inspector, "/flows/events")) as FlowUpdate)
          .order;
        runIds.push(after.find((id) => !before.has(id))!);
        outcomes.push(undefined);
      }
    }
    await delay(10); // Response capture lands asynchronously after the SDK call.
    const flows = (await stream(inspector, "/flows/events")) as FlowUpdate;
    const traces = (await stream(inspector, "/events")).traces as Trace[];
    const definition = flows.definitions.find(
      (d) => d.name === flow.definition.name,
    );
    assert.ok(definition, `captured definition ${flow.definition.name}`);
    return {
      definition,
      local: flow.definition,
      runs: runIds.map((id) => flows.upserts.find((r) => r.id === id)!),
      runIds,
      outcomes,
      traces: new Map(traces.map((t) => [t.id, t])),
      names: flows.definitions.map((d) => d.name),
    };
  } finally {
    inspector.dispose();
  }
}
const nodeOf = (definition: FlowDefinition, id: string) => {
  const node = definition.nodes.find((n) => n.id === id);
  assert.ok(node, `node ${id}`);
  return node;
};
const ruleOf = (definition: FlowDefinition, id: string) => {
  const node = nodeOf(definition, id);
  assert.ok(node.kind === "branch" || node.kind === "if", `rule node ${id}`);
  return node.conditionRule;
};
const itemDefinitionOf = (definition: FlowDefinition, id: string) => {
  const found = nodeOf(definition, id).itemDefinition;
  assert.ok(found, `itemDefinition of ${id}`);
  return found;
};
const replay = (
  definition: FlowDefinition,
  nodeId: string,
  run: FlowRun,
  traces: ReadonlyMap<string, Trace>,
  overrides?: Record<string, number>,
) => evaluate(nodeId, ruleOf(definition, nodeId), run, traces, overrides);
const byKey = (changes: WhatIfChange[]) =>
  [...changes].sort((a, b) =>
    `${a.runId}/${a.nodeId}`.localeCompare(`${b.runId}/${b.nodeId}`),
  );
const change = (
  runId: string,
  nodeId: string,
  recorded: boolean,
): WhatIfChange => ({ runId, nodeId, recorded, replayed: !recorded });
const decisions = (runs: FlowRun[], nodeId: string) =>
  runs.map((r) => r.steps[nodeId]?.decision);
const shape = (t: ReturnType<typeof thresholds>) =>
  t.map(({ id, nodeId, op, value, probability, label }) => ({
    id,
    nodeId,
    op,
    value,
    probability,
    label,
  }));

// A: task outputs, gt, flow.if with its merge, a branch over the merge result.
type TaskInput = { risk: number; eligible: number };
function taskFlow() {
  return defineJevFlow<TaskInput>("what-if-v2-tasks", (f) => {
    const score = f.task("score", {
      input: f.input.get("risk"),
      run: (risk) => ({ risk, detail: { risk } }),
    });
    const selected = f.if("gate", {
      when: score.get("risk").gt(0.5),
      then: (a) => a.task("hi", { input: null, run: () => ({ level: 2 }) }),
      else: (a) => a.task("lo", { input: null, run: () => ({ level: 1 }) }),
    });
    const review = f.jev("review", {
      state: { eligible: f.input.get("eligible") },
      questions: { eligible: noul("Eligible?") },
    });
    return f.branch("final", {
      when: all(
        selected.get("level").gte(2),
        review.answer("eligible").noul.gt(0.8),
      ),
      then: (p) => p.output("approve"),
      else: (p) =>
        p.branch("fallback", {
          when: score.get("detail").get("risk").lt(0.3),
          then: (q) => q.output("low"),
          else: (q) => q.output("manual"),
        }),
    });
  });
}
const taskInputs: TaskInput[] = [
  { risk: 0.8, eligible: 0.9 }, // a0 gate T, final T
  { risk: 0.5, eligible: 0.9 }, // a1 gate F at the strict boundary, fallback F
  { risk: 0.2, eligible: 0.95 }, // a2 gate F, fallback T
  { risk: 0.9, eligible: 0.8 }, // a3 gate T, final F at the strict jev boundary
  { risk: 0.7, eligible: 0.85 }, // a4 gate T, final T
];
const taskDecisions: Record<string, (boolean | undefined)[]> = {
  gate: [true, false, false, true, true],
  "gate-result": [true, false, false, true, true], // merge copies the if decision
  final: [true, false, false, false, true],
  fallback: [undefined, false, true, false, undefined],
};

// B: capture bounds on task outputs (depth 12, 150-entry collections), and a
// string task output under eq (a placeholder must never compare as a string).
type Deep = { a: Deep; v: number };
function captureFlow() {
  return defineJevFlow<{ x: number }>("what-if-v2-capture", (f) => {
    const deep = f.task("deep", {
      input: f.input.get("x"),
      run: (x) => {
        let value: Record<string, unknown> = { v: x };
        for (let i = 0; i < 11; i++) value = { a: value, v: x };
        // Recursive fixture shape; the loop above builds exactly that.
        return value as Deep;
      },
    });
    const list = f.task("list", {
      input: f.input.get("x"),
      run: (x) => ({ xs: Array.from({ length: 160 }, () => x) }),
    });
    const tag = f.task("tag", { input: null, run: () => ({ label: "vip" }) });
    f.if("label", {
      when: tag.get("label").eq("vip"),
      then: (a) => a.input,
      else: (a) => a.input,
    });
    let shallowRef: FlowExpression<Deep> = deep;
    for (let i = 0; i < 10; i++) shallowRef = shallowRef.get("a");
    let deepRef: FlowExpression<Deep> = deep;
    for (let i = 0; i < 11; i++) deepRef = deepRef.get("a");
    f.if("short", {
      when: list.get("xs").get(149).gt(0.5),
      then: (a) => a.input,
      else: (a) => a.input,
    });
    f.if("long", {
      when: list.get("xs").get(155).gt(0.5), // dropped by the 150-entry capture bound
      then: (a) => a.input,
      else: (a) => a.input,
    });
    return f.branch("shallow", {
      when: shallowRef.get("v").gt(0.5), // 11 keys below output: captured
      then: (p) =>
        p.branch("deep-gate", {
          when: deepRef.get("v").gt(0.5), // 12 keys below output: "[truncated]"
          then: (q) => q.output("yes"),
          else: (q) => q.output("no"),
        }),
      else: (p) => p.output("none"),
    });
  });
}

// C: map item program with a request factory, item-level if over a Jev answer
// and over a task output. The parent has its own "assess" step on purpose.
type MapInput = { top: number; items: number[] };
function mapFlow() {
  return defineJevFlow<MapInput>("what-if-v2-map", (f) => {
    const top = f.jev("assess", {
      state: { yes: f.input.get("top") },
      questions: { yes: noul("Top?") },
    });
    const results = f.map(
      "batch",
      { items: f.input.get("items"), input: null, maxItems: 4, concurrency: 1 },
      (item) => {
        const assess = item.jev("assess", {
          input: item.input.get("item"),
          request: (yes) => ({ state: { yes }, questions: { yes: noul("Keep?") } }),
        });
        const weigh = item.task("weigh", {
          input: item.input.get("item"),
          run: (w) => ({ w }),
        });
        const keep = item.if("keep", {
          when: assess.answer("yes").noul.gte(0.5),
          then: (a) => a.task("kept", { input: null, run: () => 1 }),
          else: (a) => a.task("dropped", { input: null, run: () => 0 }),
        });
        const heavy = item.if("heavy", {
          when: weigh.get("w").gt(0.7),
          then: (a) => a.task("big", { input: null, run: () => "big" }),
          else: (a) => a.task("small", { input: null, run: () => "small" }),
        });
        return item.task("combine", {
          input: { keep, heavy, item: item.input.get("item") },
          run: (x) => {
            if (x.item === 0.33) throw new Error("item failed");
            return x;
          },
        });
      },
    );
    return f.branch("route", {
      when: top.answer("yes").noul.gte(0.5),
      then: (p) => p.output("yes", results),
      else: (p) => p.output("no"),
    });
  });
}
const mapInputs: MapInput[] = [
  { top: 0.9, items: [0.2, 0.9, 0.5] },
  { top: 0.1, items: [0.75, 0.4, 0.7] },
];
// Item runs in parent order, then item order: i00 i01 i02 i10 i11 i12.
const itemValues = [0.2, 0.9, 0.5, 0.75, 0.4, 0.7];
const keepDecisions = [false, true, true, true, false, true]; // gte 0.5
const heavyDecisions = [false, true, false, true, false, false]; // gt 0.7 (0.7 strict)

// D: loop iterations with an iteration-level if; a parent branch reads the loop result.
function loopFlow() {
  return defineJevFlow<{ asks: number[] }>("what-if-v2-loop", (f) => {
    const final = f.loop(
      "rounds",
      {
        initial: { count: 0, hits: 0 },
        input: { asks: f.input.get("asks") },
        while: (s) => s.get("count").lt(3),
        maxIterations: 3,
      },
      (r) => {
        const pick = r.task("pick", {
          input: r.input,
          run: ({ state, context }) => ({ p: context.asks[state.count] }),
        });
        const ask = r.jev("ask", {
          state: { yes: pick.get("p") },
          questions: { yes: noul("Enough?") },
        });
        return r.if("enough", {
          when: ask.answer("yes").noul.gt(0.6),
          then: (a) =>
            a.task("hit", {
              input: a.input.get("state"),
              run: (s) => ({ count: s.count + 1, hits: s.hits + 1 }),
            }),
          else: (a) =>
            a.task("miss", {
              input: a.input.get("state"),
              run: (s) => ({ count: s.count + 1, hits: s.hits }),
            }),
        });
      },
    );
    return f.branch("hits", {
      when: final.get("hits").gte(2),
      then: (p) => p.output("often"),
      else: (p) => p.output("rarely"),
    });
  });
}
const loopInputs = [{ asks: [0.9, 0.6, 0.7] }, { asks: [0.1, 0.65, 0.3] }];
const askValues = [0.9, 0.6, 0.7, 0.1, 0.65, 0.3];
const enoughDecisions = [true, false, true, false, true, false]; // gt 0.6 (0.6 strict)

const tasks = record(taskFlow, taskInputs);
const bounds = record(captureFlow, [{ x: 0.9 }]);
const mapped = record(mapFlow, mapInputs);
const looped = record(loopFlow, loopInputs);
// Same node ids, new parent and item definition identities (as after a hot reload).
const remapped = record(mapFlow, [mapInputs[0]]);
// Recorded item runs, read straight from the capture (not through the helper).
const recordedItems = (runs: FlowRun[], nodeId: string) =>
  runs.flatMap((r) =>
    (r.steps[nodeId]?.collection?.items ?? []).flatMap((i) =>
      i.run ? [i.run] : [],
    ),
  );

test("premise: 0.4.0 records task data, if/merge decisions, item runs and item trace links as the spec assumes", async () => {
  const a = await tasks;
  assert.deepEqual(a.outcomes, ["approve", "manual", "low", "manual", "approve"]);
  for (const [nodeId, expected] of Object.entries(taskDecisions))
    assert.deepEqual(decisions(a.runs, nodeId), expected, `premise ${nodeId}`);
  assert.equal(nodeOf(a.definition, "gate").kind, "if");
  assert.equal(nodeOf(a.definition, "gate-result").kind, "merge");
  assert.equal(nodeOf(a.definition, "gate-result").conditionRule, undefined);
  assert.deepEqual(a.runs[0].steps.score.data, {
    input: 0.8,
    output: { risk: 0.8, detail: { risk: 0.8 } },
  });
  assert.equal(a.runs[0].steps.score.traceId, undefined);
  assert.deepEqual(a.runs[0].steps["gate-result"].data, { output: { level: 2 } });
  assert.equal(a.runs[0].steps.lo.status, "untaken");
  assert.equal(a.runs[1].steps.hi.status, "untaken");
  const gate = ruleOf(a.definition, "gate") as Record<string, unknown>;
  assert.equal(gate.op, "gt");
  assert.deepEqual((gate.args as unknown[])[0], {
    op: "reference",
    label: "score.risk",
    probability: false,
    name: "risk",
    stepId: "score",
    path: ["risk"],
    source: "task",
  });
  for (const run of a.runs)
    assert.ok(a.traces.get(run.steps.review.traceId!)?.result);

  const b = await bounds;
  for (const id of ["label", "short", "long", "shallow", "deep-gate"])
    assert.equal(b.runs[0].steps[id].decision, true, `premise ${id}`);
  const captured = b.runs[0].steps.list.data as { output: { xs: unknown[] } };
  assert.equal(captured.output.xs.length, 150);
  assert.ok(JSON.stringify(b.runs[0].steps.deep.data).includes('"[truncated]"'));

  const c = await mapped;
  assert.deepEqual(c.outcomes, ["yes", "no"]);
  assert.deepEqual(decisions(c.runs, "route"), [true, false]);
  const itemDefinition = itemDefinitionOf(c.definition, "batch");
  const items = recordedItems(c.runs, "batch");
  assert.equal(items.length, 6);
  assert.deepEqual(decisions(items, "keep"), keepDecisions);
  assert.deepEqual(decisions(items, "heavy"), heavyDecisions);
  assert.deepEqual(decisions(items, "keep-result"), keepDecisions);
  assert.deepEqual(
    items.map((r) => (r.steps.weigh.data as { output: { w: number } }).output.w),
    itemValues,
  );
  c.runs.forEach((parent, p) =>
    parent.steps.batch.collection!.items.forEach((item, index) => {
      assert.equal(item.run!.definitionId, itemDefinition.id);
      const step = item.run!.steps.assess;
      const trace = c.traces.get(step.traceId!);
      assert.ok(trace?.result, `item ${p}/${index} links its own trace`);
      assert.equal(trace.flow?.runId, parent.id);
      assert.equal(trace.flow?.stepId, `batch/${index}/assess`);
      assert.equal(trace.flow?.executionId, step.executionId);
    }),
  );
  // Item definitions are delivered nested in their map/loop node only.
  assert.deepEqual(c.names, ["what-if-v2-map"]);

  const d = await looped;
  assert.deepEqual(d.outcomes, ["often", "rarely"]);
  assert.deepEqual(decisions(d.runs, "hits"), [true, false]);
  assert.deepEqual(decisions(d.runs, "rounds"), [false, false]); // final while check
  assert.ok(nodeOf(d.definition, "rounds").conditionRule);
  assert.deepEqual(d.runs[0].steps.rounds.data, {
    input: { count: 0, hits: 0 },
    output: { count: 3, hits: 2 },
  });
  const iterations = recordedItems(d.runs, "rounds");
  assert.deepEqual(decisions(iterations, "enough"), enoughDecisions);
  for (const run of iterations)
    assert.equal(run.definitionId, itemDefinitionOf(d.definition, "rounds").id);

  const e = await remapped;
  assert.notEqual(e.definition.id, c.definition.id);
  assert.notEqual(
    itemDefinitionOf(e.definition, "batch").id,
    itemDefinitionOf(c.definition, "batch").id,
  );
});

test("gt: listed with op gt, strict at the boundary, and not a replay limit", async () => {
  const a = await tasks;
  assert.deepEqual(shape(thresholds(a.definition)), [
    { id: "gate#1", nodeId: "gate", op: "gt", value: 0.5, probability: false, label: "score.risk" },
    { id: "final#0.1", nodeId: "final", op: "gte", value: 2, probability: false, label: "gate-result.level" },
    { id: "final#1.1", nodeId: "final", op: "gt", value: 0.8, probability: true, label: "review.eligible" },
    { id: "fallback#1", nodeId: "fallback", op: "lt", value: 0.3, probability: false, label: "score.detail.risk" },
  ]);
  assert.deepEqual(thresholds(a.local), thresholds(a.definition));
  const [a0, , , a3] = a.runs;
  const at = (run: FlowRun, nodeId: string, o: Record<string, number>) =>
    replay(a.definition, nodeId, run, a.traces, o);
  // Jev answer under gt: 0.9 > t.
  assert.equal(at(a0, "final", { "final#1.1": 0.9 }), false);
  assert.equal(at(a0, "final", { "final#1.1": 0.89 }), true);
  assert.equal(at(a3, "final", { "final#1.1": 0.8 }), false);
  assert.equal(at(a3, "final", { "final#1.1": 0.79 }), true);
  // Hand-built rules over captured literals.
  const lit = (value: unknown) => ({ op: "literal", value });
  const hand = (rule: unknown) => evaluate("x", rule, a0, a.traces);
  assert.equal(hand({ op: "gt", args: [lit(1), lit(1)] }), false);
  assert.equal(hand({ op: "gt", args: [lit(1.0001), lit(1)] }), true);
  assert.equal(hand({ op: "gt", args: [lit(0.5), lit(1)] }), false);
  for (const rule of [
    { op: "gt", args: [lit("2"), lit(1)] },
    { op: "gt", args: [lit(2), lit(true)] },
    { op: "gt", args: [lit(2)] },
    { op: "gt", args: [lit(2), lit(1), lit(0)] },
    { op: "gt", args: [lit(2), lit("[redacted]")] },
  ])
    assert.equal(hand(rule), undefined, JSON.stringify(rule));
  // A gt rule replays: no limits. Broken gt rules are a "rule" limit.
  assert.deepEqual(limits(ruleOf(a.definition, "gate"), a.definition), []);
  assert.deepEqual(limits(ruleOf(a.definition, "final"), a.definition), []);
  const gate = ruleOf(a.definition, "gate") as { args: unknown[] };
  const ref = gate.args[0];
  assert.deepEqual(limits({ op: "gt", args: [ref, lit("[redacted]")] }), ["rule"]);
  assert.deepEqual(limits({ op: "gt", args: [ref] }), ["rule"]);
  // Thresholds: gt on if and branch nodes only; no other kinds, no ref-vs-ref.
  const eligible = {
    op: "reference",
    label: "review.eligible",
    probability: true,
    name: "eligible",
    stepId: "review",
    path: ["answers", "eligible", "noul"],
  };
  const gt = (left: unknown, right: unknown) => ({ op: "gt", args: [left, right] }) as never;
  const node = (id: string, kind: string, conditionRule?: unknown) =>
    ({ id, kind, dependencies: [], path: [], conditionRule }) as never;
  assert.deepEqual(
    thresholds({
      version: 1,
      id: "hand",
      name: "hand",
      nodes: [
        node("t", "task", gt(eligible, lit(1))),
        node("m", "merge", gt(eligible, lit(1))),
        node("l", "loop", gt(eligible, lit(1))),
        node("p", "map", gt(eligible, lit(1))),
        node("rr", "if", gt(eligible, eligible)),
        node("i", "if", gt(eligible, lit(0.25))),
        node("b", "branch", gt(eligible, lit(0.75))),
      ],
    }).map(({ id, op, value }) => [id, op, value]),
    [
      ["i#1", "gt", 0.25],
      ["b#1", "gt", 0.75],
    ],
  );
});

test("task references: resolved from step.data.output along the reference path", async () => {
  const a = await tasks;
  const [a0, a1, a2, a3] = a.runs;
  const at = (run: FlowRun, nodeId: string, o?: Record<string, number>) =>
    replay(a.definition, nodeId, run, a.traces, o);
  // if over a task output, strict at the boundary (a1 risk is exactly 0.5).
  assert.equal(at(a1, "gate"), false);
  assert.equal(at(a1, "gate", { "gate#1": 0.49 }), true);
  assert.equal(at(a1, "gate", { "gate#1": 0.5 }), false);
  assert.equal(at(a0, "gate", { "gate#1": 0.8 }), false);
  assert.equal(at(a0, "gate", { "gate#1": 0.79 }), true);
  // Nested task path, inside a branch's else arm.
  assert.equal(at(a1, "fallback", { "fallback#1": 0.51 }), true);
  assert.equal(at(a2, "fallback", { "fallback#1": 0.2 }), false);
  // Merge (flow.if result) output, combined with a Jev answer.
  assert.equal(at(a0, "final", { "final#0.1": 2.5 }), false);
  assert.equal(at(a1, "final", { "final#0.1": 1 }), true);
  assert.equal(at(a3, "final", { "final#0.1": 1 }), false); // jev side still false
  // The value really comes from step data: forge it and the replay follows.
  const forged = structuredClone(a0);
  forged.steps.score.data = { input: 0.8, output: { risk: 0.1, detail: { risk: 0.1 } } };
  assert.equal(evaluate("gate", ruleOf(a.definition, "gate"), forged, a.traces), false);
  assert.equal(evaluate("fallback", ruleOf(a.definition, "fallback"), forged, a.traces), true);
  // Empty path: the output itself.
  const whole = { op: "reference", label: "x", probability: false, stepId: "gate-result", path: ["level"], source: "task" };
  const scalarRun = structuredClone(a0);
  scalarRun.steps["gate-result"].data = { output: 7 };
  const self = { ...whole, path: [] };
  assert.equal(
    evaluate("x", { op: "gt", args: [self, { op: "literal", value: 6 }] }, scalarRun, a.traces),
    true,
  );
  assert.equal(
    evaluate("x", { op: "eq", args: [whole, { op: "literal", value: 2 }] }, a0, a.traces),
    true,
  );
  // Task references read step data only; request references read traces only.
  const linked = structuredClone(a0);
  linked.steps.score.traceId = a0.steps.review.traceId;
  assert.equal(evaluate("gate", ruleOf(a.definition, "gate"), linked, a.traces), true);
  const shadowed = structuredClone(a0);
  shadowed.steps.review.data = {
    output: { answers: { eligible: { noul: 0.1 } } },
    answers: { eligible: { noul: 0.1 } },
  };
  assert.equal(evaluate("final", ruleOf(a.definition, "final"), shadowed, a.traces), true);
  const asTask = { op: "reference", label: "review.eligible", probability: true, stepId: "review", path: ["answers", "eligible", "noul"], source: "task" };
  assert.equal(
    evaluate("x", { op: "gt", args: [asTask, { op: "literal", value: 0.5 }] }, a0, a.traces),
    undefined,
  );
  // whatIfValues reads the same values the replay compares.
  assert.deepEqual(
    values(a.definition, a.runs, a.traces, "gate#1"),
    a.runs.map((r, i) => ({ runId: r.id, value: taskInputs[i].risk })),
  );
  assert.deepEqual(
    values(a.definition, a.runs, a.traces, "final#0.1"),
    a.runs.map((r, i) => ({ runId: r.id, value: [2, 1, 1, 2, 2][i] })),
  );
  assert.deepEqual(
    values(a.definition, a.runs, a.traces, "final#1.1"),
    a.runs.map((r, i) => ({ runId: r.id, value: taskInputs[i].eligible })),
  );
});

test("task references: redacted, truncated, failed or missing step data is unavailable, never guessed", async () => {
  // Redacted leaf: gate reads score.risk; fallback reads score.detail.risk.
  const redacted = await record(taskFlow, [taskInputs[1]], (path, value) =>
    path.join("/") === "steps/score/data/output/risk" ? "[redacted]" : value,
  );
  const run = redacted.runs[0];
  assert.equal(run.steps.gate.decision, false, "premise: execution unaffected");
  assert.equal(replay(redacted.definition, "gate", run, redacted.traces), undefined);
  assert.equal(replay(redacted.definition, "fallback", run, redacted.traces), false);
  assert.equal(replay(redacted.definition, "final", run, redacted.traces), false);
  assert.deepEqual(values(redacted.definition, redacted.runs, redacted.traces, "gate#1"), []);
  assert.deepEqual(
    across(redacted.definition, redacted.runs, redacted.traces, { "gate#1": 0.1 }),
    { evaluated: 2, unavailable: 1, changed: [] },
  );
  // Whole output redacted, and a capture failure (the recorder writes a placeholder).
  const hidden = await record(taskFlow, [taskInputs[1]], (path, value) =>
    path.join("/") === "steps/score/data/output" ? "[redacted]" : value,
  );
  assert.equal(replay(hidden.definition, "gate", hidden.runs[0], hidden.traces), undefined);
  assert.equal(replay(hidden.definition, "fallback", hidden.runs[0], hidden.traces), undefined);
  assert.equal(replay(hidden.definition, "final", hidden.runs[0], hidden.traces), false);
  const failed = await record(taskFlow, [taskInputs[1]], (path, value) => {
    if (path[0] === "steps" && path[1] === "score") throw new Error("no capture");
    return value;
  });
  assert.equal(failed.runs[0].steps.score.data, "[capture unavailable]");
  assert.equal(failed.runs[0].steps.gate.decision, false);
  assert.equal(replay(failed.definition, "gate", failed.runs[0], failed.traces), undefined);
  assert.equal(replay(failed.definition, "final", failed.runs[0], failed.traces), false);
  // Capture bounds: depth 12 and 150-entry collections, recorded true by the engine.
  const b = await bounds;
  const [bound] = b.runs;
  assert.equal(replay(b.definition, "label", bound, b.traces), true);
  assert.equal(replay(b.definition, "shallow", bound, b.traces), true);
  assert.equal(replay(b.definition, "short", bound, b.traces), true);
  assert.equal(replay(b.definition, "deep-gate", bound, b.traces), undefined);
  assert.equal(replay(b.definition, "long", bound, b.traces), undefined);
  assert.deepEqual(across(b.definition, b.runs, b.traces, {}), {
    evaluated: 3,
    unavailable: 2,
    changed: [],
  });
  // A redacted string is a placeholder, not the string "[redacted]".
  const tagged = await record(captureFlow, [{ x: 0.9 }], (path, value) =>
    path.join("/") === "steps/tag/data/output/label" ? "[redacted]" : value,
  );
  assert.equal(tagged.runs[0].steps.label.decision, true, "premise: execution unaffected");
  const notVip = {
    op: "not",
    args: [ruleOf(tagged.definition, "label")],
  };
  assert.equal(replay(tagged.definition, "label", tagged.runs[0], tagged.traces), undefined);
  assert.equal(evaluate("label", notVip, tagged.runs[0], tagged.traces), undefined);
  // eq on a task output keeps the engine's same-type rule.
  const label = (ruleOf(b.definition, "label") as { args: unknown[] }).args[0];
  const eqTo = (value: unknown) =>
    evaluate("x", { op: "eq", args: [label, { op: "literal", value }] }, bound, b.traces);
  assert.equal(eqTo("vip"), true);
  assert.equal(eqTo("VIP"), false);
  for (const value of [1, true, null]) assert.equal(eqTo(value), undefined, String(value));
  // Missing or malformed step data.
  const a = await tasks;
  const a0 = a.runs[0];
  const gate = ruleOf(a.definition, "gate");
  const final = ruleOf(a.definition, "final");
  const mutate = (edit: (run: FlowRun) => void) => {
    const copy = structuredClone(a0);
    edit(copy);
    return copy;
  };
  assert.equal(evaluate("gate", gate, a0, a.traces), true, "control");
  for (const [name, run] of [
    ["no data", mutate((r) => delete r.steps.score.data)],
    // A task that never finished has input only; never read the input instead.
    [
      "input only (task never finished)",
      mutate((r) => (r.steps.score.data = { input: { risk: 0.8, detail: { risk: 0.8 } } })),
    ],
    ["null data", mutate((r) => (r.steps.score.data = null))],
    ["array data", mutate((r) => (r.steps.score.data = [{ output: { risk: 0.8 } }]))],
    ["string data", mutate((r) => (r.steps.score.data = "[truncated]"))],
    ["missing key", mutate((r) => (r.steps.score.data = { input: 0.8, output: { detail: { risk: 0.8 } } }))],
    ["null output", mutate((r) => (r.steps.score.data = { input: 0.8, output: null }))],
    ["string value", mutate((r) => (r.steps.score.data = { output: { risk: "0.8" } }))],
    ["truncated value", mutate((r) => (r.steps.score.data = { output: { risk: "[truncated]" } }))],
    ["no step", mutate((r) => delete (r.steps as Record<string, unknown>).score)],
  ] as const)
    assert.equal(evaluate("gate", gate, run, a.traces), undefined, name);
  const inherited = mutate((r) => (r.steps.score.data = { output: Object.create({ risk: 0.8 }) }));
  assert.equal(evaluate("gate", gate, inherited, a.traces), undefined, "inherited key");
  // A merge whose value could not be captured stores a message string.
  const unmerged = mutate(
    (r) => (r.steps["gate-result"].data = "Selected value could not be captured as JSON."),
  );
  assert.equal(evaluate("final", final, unmerged, a.traces), undefined);
});

test("flow.if: replayed and counted like branches; merge and loop nodes are never counted", async () => {
  const a = await tasks;
  const [a0, a1, a2, a3, a4] = a.runIds;
  assert.deepEqual(across(a.definition, a.runs, a.traces, {}), {
    evaluated: 13, // gate 5 + final 5 + fallback 3; the merge copies are not decisions
    unavailable: 0,
    changed: [],
  });
  assert.deepEqual(
    byKey(across(a.definition, a.runs, a.traces, { "gate#1": 0.85 }).changed),
    byKey([change(a0, "gate", true), change(a4, "gate", true)]),
  );
  assert.deepEqual(
    across(a.definition, a.runs, a.traces, { "gate#1": 0.49 }).changed,
    [change(a1, "gate", false)],
  );
  // Each decision replays on its own recorded operands: no downstream cascade.
  assert.deepEqual(
    across(a.definition, a.runs, a.traces, { "final#1.1": 0.86 }).changed,
    [change(a4, "final", true)],
  );
  assert.deepEqual(across(a.definition, a.runs, a.traces, { "final#1.1": 0.8 }).changed, []);
  assert.deepEqual(
    across(a.definition, a.runs, a.traces, { "final#1.1": 0.79 }).changed,
    [change(a3, "final", false)],
  );
  assert.deepEqual(
    across(a.definition, a.runs, a.traces, { "fallback#1": 0.6 }).changed,
    [change(a1, "fallback", false)],
  );
  void a2;
  // A decision whose unmodified replay disagrees with the record is unavailable,
  // whatever the override (here the task output was altered after the run).
  const forged = structuredClone(a.runs[0]);
  forged.steps.score.data = { input: 0.8, output: { risk: 0.1, detail: { risk: 0.1 } } };
  for (const overrides of [{}, { "gate#1": 0.05 }, { "gate#1": 0.95 }] as Record<string, number>[])
    assert.deepEqual(across(a.definition, [forged], a.traces, overrides), {
      evaluated: 1,
      unavailable: 1,
      changed: [],
    });
  // Loop gates: thresholds list only the parent branch; overrides of the loop are inert.
  const d = await looped;
  assert.deepEqual(shape(thresholds(d.definition)), [
    { id: "hits#1", nodeId: "hits", op: "gte", value: 2, probability: false, label: "rounds.hits" },
  ]);
  assert.deepEqual(across(d.definition, d.runs, d.traces, {}), {
    evaluated: 2,
    unavailable: 0,
    changed: [],
  });
  assert.deepEqual(across(d.definition, d.runs, d.traces, { "rounds#1": 99 }), {
    evaluated: 2,
    unavailable: 0,
    changed: [],
  });
  // The parent branch reads the loop's captured final state (source "task").
  assert.deepEqual(
    across(d.definition, d.runs, d.traces, { "hits#1": 1 }).changed,
    [change(d.runIds[1], "hits", false)],
  );
  assert.deepEqual(values(d.definition, d.runs, d.traces, "hits#1"), [
    { runId: d.runIds[0], value: 2 },
    { runId: d.runIds[1], value: 1 },
  ]);
});

test("whatIfItemRuns: item runs in parent then item order, skipping items without a run", async () => {
  const c = await mapped;
  const items = itemRuns(c.runs, "batch");
  assert.deepEqual(items, recordedItems(c.runs, "batch"));
  assert.deepEqual(
    items.map((r) => (r.steps.weigh.data as { output: { w: number } }).output.w),
    itemValues,
  );
  assert.deepEqual(
    itemRuns([...c.runs].reverse(), "batch").map((r) => r.id),
    [...items.slice(3), ...items.slice(0, 3)].map((r) => r.id),
  );
  assert.deepEqual(itemRuns(c.runs, "route"), []);
  assert.deepEqual(itemRuns(c.runs, "missing"), []);
  assert.deepEqual(itemRuns([], "batch"), []);
  const d = await looped;
  assert.deepEqual(itemRuns(d.runs, "rounds"), recordedItems(d.runs, "rounds"));
  assert.equal(itemRuns(d.runs, "rounds").length, 6);
  // A failed item keeps its run; queued items blocked behind it have none.
  const failing = await record(mapFlow, [{ top: 0.9, items: [0.33, 0.9, 0.5] }]);
  const collection = failing.runs[0].steps.batch.collection!;
  assert.deepEqual(
    collection.items.map((i) => [i.status, !!i.run]),
    [
      ["error", true],
      ["blocked", false],
      ["blocked", false],
    ],
    "premise: map failure",
  );
  const failed = itemRuns(failing.runs, "batch");
  assert.deepEqual(failed.map((r) => r.id), [collection.items[0].run!.id]);
  assert.deepEqual(
    across(itemDefinitionOf(failing.definition, "batch"), failed, failing.traces, {}),
    { evaluated: 2, unavailable: 0, changed: [] },
  );
  // Malformed captures are skipped, not thrown on.
  const broken = structuredClone(c.runs[0]);
  (broken.steps.batch as Record<string, unknown>).collection = { total: 1, items: "x" };
  const partial = structuredClone(c.runs[1]);
  partial.steps.batch.collection!.items = [
    { index: 0, status: "waiting" },
    ...partial.steps.batch.collection!.items.slice(1),
  ];
  assert.deepEqual(
    itemRuns([broken, partial], "batch").map((r) => r.id),
    c.runs[1].steps.batch.collection!.items.slice(1).map((i) => i.run!.id),
  );
  // Pure.
  const snapshot = JSON.stringify(c.runs);
  itemRuns(c.runs, "batch");
  assert.equal(JSON.stringify(c.runs), snapshot);
});

test("map items: item-level if over a factory Jev answer and a task output replays against the item run", async () => {
  const c = await mapped;
  const definition = itemDefinitionOf(c.definition, "batch");
  assert.deepEqual(shape(thresholds(definition)), [
    { id: "keep#1", nodeId: "keep", op: "gte", value: 0.5, probability: true, label: "assess.yes" },
    { id: "heavy#1", nodeId: "heavy", op: "gt", value: 0.7, probability: false, label: "weigh.w" },
  ]);
  // Thresholds are per definition: the parent lists only its own branch.
  assert.deepEqual(thresholds(c.definition).map((t) => t.id), ["route#1"]);
  const items = recordedItems(c.runs, "batch");
  items.forEach((run, i) => {
    assert.equal(replay(definition, "keep", run, c.traces), keepDecisions[i], `keep ${i}`);
    assert.equal(replay(definition, "heavy", run, c.traces), heavyDecisions[i], `heavy ${i}`);
  });
  const i12 = items[5]; // w = 0.7
  assert.equal(replay(definition, "heavy", i12, c.traces, { "heavy#1": 0.7 }), false);
  assert.equal(replay(definition, "heavy", i12, c.traces, { "heavy#1": 0.69 }), true);
  const i02 = items[2]; // yes = 0.5
  assert.equal(replay(definition, "keep", i02, c.traces, { "keep#1": 0.5 }), true);
  assert.equal(replay(definition, "keep", i02, c.traces, { "keep#1": 0.51 }), false);
  // Resolution uses the item run's own step traceIds; trace.flow (parent run id,
  // composed batch/index/step id) is never consulted.
  for (const edit of [
    (t: Trace) => delete t.flow,
    (t: Trace) => (t.flow = { runId: "elsewhere", stepId: "assess", executionId: "x" }),
  ]) {
    const traces = new Map(
      [...c.traces].map(([id, t]) => {
        const copy = structuredClone(t);
        edit(copy);
        return [id, copy] as const;
      }),
    );
    items.forEach((run, i) =>
      assert.equal(replay(definition, "keep", run, traces), keepDecisions[i], `keep ${i}`),
    );
  }
  // An item run without its trace link is unavailable for the Jev rule only.
  const unlinked = structuredClone(items[1]);
  delete unlinked.steps.assess.traceId;
  assert.equal(replay(definition, "keep", unlinked, c.traces), undefined);
  assert.equal(replay(definition, "heavy", unlinked, c.traces), true);
  assert.deepEqual(
    values(definition, items, c.traces, "heavy#1"),
    items.map((r, i) => ({ runId: r.id, value: itemValues[i] })),
  );
  assert.deepEqual(
    values(definition, items, c.traces, "keep#1"),
    items.map((r, i) => ({ runId: r.id, value: itemValues[i] })),
  );
  assert.deepEqual(limits(ruleOf(definition, "heavy"), definition), []);
});

test("map items: counting across item runs gathered from retained parent runs", async () => {
  const c = await mapped;
  const definition = itemDefinitionOf(c.definition, "batch");
  const items = itemRuns(c.runs, "batch");
  const id = (i: number) => items[i].id;
  assert.deepEqual(across(definition, items, c.traces, {}), {
    evaluated: 12,
    unavailable: 0,
    changed: [],
  });
  const raised = across(definition, items, c.traces, { "keep#1": 0.8 });
  assert.equal(raised.evaluated, 12);
  assert.deepEqual(
    byKey(raised.changed),
    byKey([change(id(2), "keep", true), change(id(3), "keep", true), change(id(5), "keep", true)]),
  );
  assert.deepEqual(across(definition, items, c.traces, { "heavy#1": 0.75 }).changed, [
    change(id(3), "heavy", true),
  ]);
  assert.deepEqual(
    byKey(across(definition, items, c.traces, { "heavy#1": 0.69, "keep#1": 0.1 }).changed),
    byKey([
      change(id(5), "heavy", false),
      change(id(0), "keep", false),
      change(id(4), "keep", false),
    ]),
  );
  // Overrides are scoped by node id: a parent threshold doesn't touch items.
  assert.deepEqual(across(definition, items, c.traces, { "route#1": 0.95 }).changed, []);
  // Parent runs are not item runs, and item runs of a re-definition are ignored.
  assert.deepEqual(across(definition, c.runs, c.traces, {}), {
    evaluated: 0,
    unavailable: 0,
    changed: [],
  });
  assert.deepEqual(across(c.definition, [...c.runs, ...items], c.traces, {}), {
    evaluated: 2,
    unavailable: 0,
    changed: [],
  });
  const e = await remapped;
  const mixed = [...items, ...itemRuns(e.runs, "batch")];
  const traces = new Map([...c.traces, ...e.traces]);
  assert.deepEqual(across(definition, mixed, traces, {}), {
    evaluated: 12,
    unavailable: 0,
    changed: [],
  });
  const again = across(itemDefinitionOf(e.definition, "batch"), mixed, traces, {
    "keep#1": 0.95,
  });
  const reItems = itemRuns(e.runs, "batch"); // 0.2, 0.9, 0.5
  assert.equal(again.evaluated, 6);
  assert.equal(again.unavailable, 0);
  assert.deepEqual(
    byKey(again.changed),
    byKey([change(reItems[1].id, "keep", true), change(reItems[2].id, "keep", true)]),
  );
  // Item-level task redaction (path below the parent's collection) is unavailable.
  const redacted = await record(mapFlow, [mapInputs[0]], (path, value) =>
    path.join("/") === "steps/batch/items/1/steps/weigh/data/output/w" ? "[redacted]" : value,
  );
  const redactedItems = itemRuns(redacted.runs, "batch");
  assert.equal(redactedItems[1].steps.heavy.decision, true, "premise: execution unaffected");
  assert.equal(
    replay(itemDefinitionOf(redacted.definition, "batch"), "heavy", redactedItems[1], redacted.traces),
    undefined,
  );
  assert.deepEqual(
    across(itemDefinitionOf(redacted.definition, "batch"), redactedItems, redacted.traces, {}),
    { evaluated: 5, unavailable: 1, changed: [] },
  );
});

test("loop iterations: iteration-level if replays per iteration run and counts across them", async () => {
  const d = await looped;
  const definition = itemDefinitionOf(d.definition, "rounds");
  assert.deepEqual(shape(thresholds(definition)), [
    { id: "enough#1", nodeId: "enough", op: "gt", value: 0.6, probability: true, label: "ask.yes" },
  ]);
  const iterations = itemRuns(d.runs, "rounds");
  iterations.forEach((run, i) =>
    assert.equal(replay(definition, "enough", run, d.traces), enoughDecisions[i], `iteration ${i}`),
  );
  assert.equal(replay(definition, "enough", iterations[1], d.traces, { "enough#1": 0.59 }), true);
  assert.equal(replay(definition, "enough", iterations[4], d.traces, { "enough#1": 0.65 }), false);
  assert.deepEqual(across(definition, iterations, d.traces, {}), {
    evaluated: 6,
    unavailable: 0,
    changed: [],
  });
  assert.deepEqual(across(definition, iterations, d.traces, { "enough#1": 0.65 }).changed, [
    change(iterations[4].id, "enough", true),
  ]);
  assert.deepEqual(across(definition, iterations, d.traces, { "enough#1": 0.59 }).changed, [
    change(iterations[1].id, "enough", false),
  ]);
  assert.deepEqual(
    values(definition, iterations, d.traces, "enough#1"),
    iterations.map((r, i) => ({ runId: r.id, value: askValues[i] })),
  );
  // Iteration traces carry the composed rounds/index/ask id; resolution ignores it.
  iterations.forEach((run, index) =>
    assert.equal(
      d.traces.get(run.steps.ask.traceId!)?.flow?.stepId,
      `rounds/${index % 3}/ask`,
    ),
  );
});

test("parity: with no overrides, every recorded decision with captured operands replays exactly", async () => {
  const check = (
    definition: FlowDefinition,
    runs: FlowRun[],
    traces: ReadonlyMap<string, Trace>,
    skip: Set<string> = new Set(),
  ) => {
    let checked = 0;
    for (const run of runs)
      for (const node of definition.nodes) {
        if (node.kind !== "branch" && node.kind !== "if") continue;
        const recorded = run.steps[node.id]?.decision;
        if (typeof recorded !== "boolean" || skip.has(node.id)) continue;
        assert.equal(
          evaluate(node.id, node.conditionRule, run, traces),
          recorded,
          `${definition.name} ${run.id} ${node.id}`,
        );
        assert.equal(evaluate(node.id, node.conditionRule, run, traces, {}), recorded);
        checked++;
      }
    const summary = across(definition, runs, traces, {});
    assert.equal(summary.evaluated, checked, `${definition.name} evaluated`);
    assert.deepEqual(summary.changed, []);
    return checked;
  };
  const a = await tasks;
  assert.equal(check(a.definition, a.runs, a.traces), 13);
  const b = await bounds;
  assert.equal(check(b.definition, b.runs, b.traces, new Set(["long", "deep-gate"])), 3);
  const c = await mapped;
  assert.equal(check(c.definition, c.runs, c.traces), 2);
  assert.equal(
    check(itemDefinitionOf(c.definition, "batch"), itemRuns(c.runs, "batch"), c.traces),
    12,
  );
  const d = await looped;
  assert.equal(check(d.definition, d.runs, d.traces), 2);
  assert.equal(
    check(itemDefinitionOf(d.definition, "rounds"), itemRuns(d.runs, "rounds"), d.traces),
    6,
  );
});

test("what-if stays pure over 0.4.0 captures: no Jev calls, nothing mutated", async () => {
  const c = await mapped;
  const d = await looped;
  const a = await tasks;
  const before = sent;
  const snapshot = JSON.stringify([c.runs, d.runs, a.runs, [...c.traces.values()], c.definition]);
  const items = itemRuns(c.runs, "batch");
  const definition = itemDefinitionOf(c.definition, "batch");
  thresholds(definition);
  across(definition, items, c.traces, { "keep#1": 0.8, "heavy#1": 0.1 });
  across(a.definition, a.runs, a.traces, { "gate#1": 0.1 });
  values(definition, items, c.traces, "heavy#1");
  across(itemDefinitionOf(d.definition, "rounds"), itemRuns(d.runs, "rounds"), d.traces, {});
  assert.equal(sent, before);
  assert.equal(
    JSON.stringify([c.runs, d.runs, a.runs, [...c.traces.values()], c.definition]),
    snapshot,
  );
});
