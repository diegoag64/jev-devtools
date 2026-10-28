import { test } from "node:test";
import assert from "node:assert/strict";
import { defineJevFlow, all } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";
import type { FlowUpdate, FlowCondition } from "../src/flow-protocol.js";

const origin = "http://localhost:5196";
const client = {
  systemOne(): never {
    throw new Error("Unexpected inference");
  },
};
async function history(
  inspector: ReturnType<typeof createJevDevtools>,
): Promise<FlowUpdate> {
  const response = await inspector.handle(
    new Request(origin + "/api/jev-devtools/flows/events"),
  );
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  try {
    const first = await reader.read();
    return JSON.parse(
      new TextDecoder().decode(first.value).split("data: ")[1].trim(),
    );
  } finally {
    await reader.cancel();
  }
}
const textWarning = "Long text truncated in capture.";
const collectionWarning = "Long collection truncated in capture.";

// One real recorder/SSE owner for the three reported failures and their limits.
for (const kind of ["text", "array", "rule"] as const) {
  const limit = kind === "array" ? 150 : 16_000;
  for (const size of [
    ...new Set([limit - 1, limit, limit + 1, kind === "array" ? 151 : 20_000]),
  ]) {
    test(`${kind} capture at ${size} retains warnings over SSE without changing execution`, async (t) => {
      const inspector = createJevDevtools({ origin, enabled: true });
      t.after(() => inspector.dispose());
      const input =
        kind === "array"
          ? Array.from({ length: size }, (_, i) => i)
          : "x".repeat(size);
      // Narrow the fixture before defining scalar equality; array captures use output only.
      const options = { client, devtools: inspector };
      const { flow, result } = await (async () => {
        if (typeof input === "string") {
          const flow = defineJevFlow<string>(`capture-${kind}`, (f) =>
            kind === "rule"
              ? f.branch("match", {
                  when: f.input.eq(input),
                  then: (p) => p.output("yes"),
                  else: (p) => p.output("no"),
                })
              : f.output("done", f.input),
          );
          return { flow, result: await flow.run(input, options) };
        }
        const flow = defineJevFlow<number[]>(`capture-${kind}`, (f) =>
          f.output("done", f.input),
        );
        return { flow, result: await flow.run(input, options) };
      })();
      const update = await history(inspector);
      const run = update.upserts[0];
      const node = update.definitions[0].nodes.find((n) => n.id === "match");
      const rule = node?.conditionRule as
        | Extract<FlowCondition, { args: FlowCondition[] }>
        | undefined;
      const captured =
        kind === "rule"
          ? (rule!.args[1] as { value: string }).value
          : (run.value as string | number[]);
      assert.equal(captured.length, Math.min(size, limit));
      assert.equal(
        kind === "rule" ? node!.conditionCaptureFidelity : run.captureFidelity,
        size > limit ? "modified" : "exact",
      );
      assert.deepEqual(
        (kind === "rule"
          ? node!.conditionCaptureWarnings
          : run.captureWarnings) ?? [],
        size > limit
          ? [kind === "array" ? collectionWarning : textWarning]
          : [],
      );
      if (kind === "rule") {
        assert.equal(result.outcome, "yes");
        assert.equal(run.steps.match.decision, true);
        assert.equal(
          (
            (flow.definition.nodes[0].conditionRule as typeof rule)!
              .args[1] as { value: string }
          ).value.length,
          size,
        );
      } else assert.deepEqual(result.value, input);
    });
  }
}

test("literal and nested reference outcomes retain complete runtime values and capture warnings", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  const value = "x".repeat(20_000);
  for (const mode of ["literal", "template"] as const) {
    const flow = defineJevFlow<string>(mode, (f) => {
      const rule = f.input.eq(value);
      return f.branch("match", {
        when: all(rule, rule),
        then: (p) =>
          p.output(
            "yes",
            mode === "literal" ? value : { first: f.input, nested: [f.input] },
          ),
        else: (p) => p.output("no"),
      });
    });
    const result = await flow.run(value, { client, devtools: inspector });
    assert.deepEqual(
      result.value,
      mode === "literal" ? value : { first: value, nested: [value] },
    );
    const update = await history(inspector);
    assert.equal(update.upserts[0].steps.match.decision, true);
    assert.deepEqual(update.upserts[0].captureWarnings, [textWarning]);
    assert.deepEqual(
      update.definitions.find((d) => d.id === flow.definition.id)!.nodes[0]
        .conditionCaptureWarnings,
      [textWarning],
    );
  }
});

test("map item and loop iteration captures retain warnings in nested runs and rules", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  const long = "x".repeat(20_000);
  const flow = defineJevFlow<string[]>("nested", (f) => {
    const mapped = f.map(
      "items",
      { items: f.input, input: null, maxItems: 1 },
      (item) =>
        item.if("match", {
          when: item.input.get("item").eq(long),
          then: (p) => p.input.get("item"),
          else: (p) => p.input.get("item"),
        }),
    );
    const loop = f.loop(
      "repeat",
      {
        initial: { count: 0, text: long },
        input: null,
        while: (s) => all(s.get("count").lt(1), s.get("text").eq(long)),
        maxIterations: 1,
      },
      (round) =>
        round.task("advance", {
          input: round.input.get("state"),
          run: (s) => ({ ...s, count: s.count + 1 }),
        }),
    );
    return f.output("done", { mapped, loop });
  });
  const result = await flow.run([long], { client, devtools: inspector });
  assert.deepEqual(result.value, {
    mapped: [long],
    loop: { count: 1, text: long },
  });
  const update = await history(inspector),
    run = update.upserts[0];
  for (const id of ["items", "repeat"]) {
    assert.equal(
      run.steps[id].collection!.items[0].run!.captureFidelity,
      "modified",
    );
    assert.ok(
      run.steps[id].collection!.items[0].run!.captureWarnings!.includes(
        textWarning,
      ),
    );
  }
  const nodes = update.definitions[0].nodes;
  assert.deepEqual(
    nodes.find((n) => n.id === "repeat")!.conditionCaptureWarnings,
    [textWarning],
  );
  assert.deepEqual(
    nodes
      .find((n) => n.id === "items")!
      .itemDefinition!.nodes.find((n) => n.id === "match")!
      .conditionCaptureWarnings,
    [textWarning],
  );
});

test("redaction and redactor failures carry explicit rule and outcome metadata", async () => {
  const original = "private-code";
  const flow = defineJevFlow<string>("private", (f) =>
    f.branch("match", {
      when: f.input.eq(original),
      then: (p) => p.output("yes", f.input),
      else: (p) => p.output("no"),
    }),
  );
  for (const fails of [false, true]) {
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: (path, value) => {
        if (value !== original) return value;
        if (fails) throw new Error("private diagnostic must not escape");
        return "replacement";
      },
    });
    try {
      const result = await flow.run(original, { client, devtools: inspector });
      assert.equal(result.value, original);
      const update = await history(inspector),
        run = update.upserts[0];
      assert.equal(run.steps.match.decision, true);
      assert.doesNotMatch(
        JSON.stringify(update),
        /private-code|private diagnostic/,
      );
      assert.deepEqual(run.captureWarnings, [
        fails
          ? "Outcome capture unavailable."
          : "Capture contains redacted values.",
      ]);
      assert.deepEqual(
        update.definitions[0].nodes[0].conditionCaptureWarnings,
        [
          fails
            ? "Rule capture unavailable."
            : "Capture contains redacted values.",
        ],
      );
    } finally {
      inspector.dispose();
    }
  }
});

test("unavailable observer snapshots retain warnings through merge and outcome capture without interpreting user strings", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  const flow = defineJevFlow<{ choose: boolean; value: unknown }>(
    "unavailable",
    (f) => {
      const selected = f.if("select", {
        when: f.input.get("choose"),
        then: (p) => p.input.get("value"),
        else: (p) => p.input.get("value"),
      });
      return f.output("done", selected);
    },
  );
  for (const value of [
    new Date("2026-01-01"),
    "[capture unavailable]",
    "[truncated]",
    "[redacted]",
  ]) {
    const result = await flow.run(
      { choose: true, value },
      { client, devtools: inspector },
    );
    assert.equal(result.value, value);
    const update = await history(inspector),
      run = update.upserts[0];
    const warnings =
      value instanceof Date ? ["Observer capture unavailable."] : [];
    assert.deepEqual(run.captureWarnings, warnings);
    const merge = update.definitions[0].nodes.find((n) => n.kind === "merge")!;
    assert.deepEqual(
      run.steps[merge.id].captureWarnings,
      value instanceof Date ? ["Selected value capture unavailable."] : [],
    );
  }
});

test("rule projection limits retain metadata without treating literal marker text as a warning", async (t) => {
  const inspector = createJevDevtools({ origin, enabled: true });
  t.after(() => inspector.dispose());
  for (const size of [127, 128, 129]) {
    const flow = defineJevFlow<boolean>(`projection-${size}`, (f) =>
      f.branch("gate", {
        when: all(...Array.from({ length: size - 1 }, () => f.input)),
        then: (p) => p.output("yes"),
        else: (p) => p.output("no"),
      }),
    );
    assert.equal(
      (await flow.run(true, { client, devtools: inspector })).outcome,
      "yes",
    );
    const update = await history(inspector);
    const warnings = size > 128 ? ["Rule projection limit reached."] : [];
    assert.deepEqual(
      update.definitions.find((d) => d.id === flow.definition.id)!.nodes[0]
        .conditionCaptureWarnings ?? [],
      warnings,
    );
    assert.equal(update.upserts[0].steps.gate.decision, true);
  }
  const marker = "[rule truncated]";
  const flow = defineJevFlow<string>("literal-marker", (f) =>
    f.branch("gate", {
      when: f.input.eq(marker),
      then: (p) => p.output("yes", f.input),
      else: (p) => p.output("no"),
    }),
  );
  assert.equal(
    (await flow.run(marker, { client, devtools: inspector })).value,
    marker,
  );
  const update = await history(inspector);
  assert.deepEqual(
    update.definitions.find((d) => d.id === flow.definition.id)!.nodes[0]
      .conditionCaptureWarnings,
    [],
  );
  assert.deepEqual(update.upserts[0].captureWarnings, []);
});
