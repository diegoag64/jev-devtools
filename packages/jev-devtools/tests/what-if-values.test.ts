import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { choice, noul, type Fetch } from "@typesafe-ai/sdk";
import { defineJevFlow, all } from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import type { Trace } from "../src/protocol.js";
import type { FlowDefinition, FlowUpdate } from "../src/flow-protocol.js";
import { whatIfValues } from "../src/what-if.js";
import { stripLayout, stripScale } from "../src/what-if-strip.js";

// Fixture transport: answers are read back from the request state.
const origin = "http://localhost:5198";
const transport: Fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body));
  const state = request.state as Record<string, unknown>;
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(
    request.questions as Record<string, { type: string }>,
  ))
    answers[name] =
      question.type === "noul"
        ? { type: "noul", noul: state[name] }
        : {
            type: "choice",
            choice: state[name],
            probabilities: { refund: 0.7, other: 0.3 },
            confidence: 0.7,
          };
  return Response.json({ model: "sample", answers });
};
async function stream(
  inspector: ReturnType<typeof createJevDevtools>,
  path: string,
) {
  const response = await inspector.handle(
    new Request(origin + "/api/jev-devtools" + path),
  );
  const reader = response.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  return JSON.parse(
    new TextDecoder().decode(first.value).split("data: ")[1].trim(),
  );
}
type Input = { category: string; eligible: number; risky: number };
const build = () =>
  defineJevFlow<Input>("values-refund", (f) => {
    const triage = f.jev("triage", {
      state: { category: f.input.get("category") },
      questions: { category: choice("Refund?", { refund: null, other: null }) },
    });
    return f.branch("refund-request", {
      when: triage.answer("category").choice.eq("refund"),
      then: (b) => {
        const review = b.jev("review", {
          state: {
            eligible: f.input.get("eligible"),
            risky: f.input.get("risky"),
          },
          questions: { eligible: noul("Eligible?"), risky: noul("Risky?") },
        });
        return b.branch("approval", {
          when: all(
            review.answer("eligible").noul.gte(0.9),
            review.answer("risky").noul.lt(0.2),
          ),
          then: (p) => p.output("approve"),
          else: (p) => p.output("manual"),
        });
      },
      else: (b) => b.output("other"),
    });
  });
async function record(
  inputs: Input[],
  redact?: (path: string[], value: unknown) => unknown,
) {
  const inspector = createJevDevtools({ origin, enabled: true, redact });
  try {
    const client = inspector.createClient(
      {
        apiKey: "sample-only",
        fetch: transport,
        logLevel: "off",
        retry: { maxRetries: 0 },
      },
      { source: "sample" },
    );
    const flow = build();
    const runIds: string[] = [];
    for (const input of inputs)
      runIds.push(
        (await flow.run(input, { client, devtools: inspector })).runId,
      );
    await delay(10); // Response capture lands asynchronously after the SDK call.
    const flows = (await stream(inspector, "/flows/events")) as FlowUpdate;
    const traces = (await stream(inspector, "/events")).traces as Trace[];
    return {
      definition: flows.definitions[0] as FlowDefinition,
      // Recorded order (the stream sends newest first); output keeps run order.
      runs: runIds.map((id) => flows.upserts.find((r) => r.id === id)!),
      traces: new Map(traces.map((t) => [t.id, t])),
      runIds,
    };
  } finally {
    inspector.dispose();
  }
}

test("whatIfValues returns the compared reference value per run, skipping runs where it doesn't resolve", async () => {
  const c = await record(
    [
      { category: "refund", eligible: 0.94, risky: 0.1 },
      { category: "refund", eligible: 0.65, risky: 0.3 },
      { category: "other", eligible: 0.99, risky: 0.1 }, // review untaken
      { category: "refund", eligible: 0.5, risky: 0.15 }, // eligible redacted below
    ],
    (path, value) =>
      path.at(-1) === "noul" && value === 0.5 ? "[redacted]" : value,
  );
  const [r0, r1, , r3] = c.runIds;
  assert.deepEqual(
    whatIfValues(c.definition, c.runs, c.traces, "approval#0.1"),
    [
      { runId: r0, value: 0.94 },
      { runId: r1, value: 0.65 },
    ],
  );
  // A nested threshold reads its own comparison's reference.
  assert.deepEqual(
    whatIfValues(c.definition, c.runs, c.traces, "approval#1.1"),
    [
      { runId: r0, value: 0.1 },
      { runId: r1, value: 0.3 },
      { runId: r3, value: 0.15 },
    ],
  );
  // Unknown ids, non-numeric comparisons and other definitions give nothing.
  assert.deepEqual(
    whatIfValues(c.definition, c.runs, c.traces, "approval#9.1"),
    [],
  );
  assert.deepEqual(
    whatIfValues(c.definition, c.runs, c.traces, "refund-request#1"),
    [],
  );
  assert.deepEqual(
    whatIfValues(
      { ...c.definition, id: "other" },
      c.runs,
      c.traces,
      "approval#0.1",
    ),
    [],
  );
  // Evicted captures are absent.
  assert.deepEqual(
    whatIfValues(c.definition, c.runs, new Map(), "approval#0.1"),
    [],
  );
});

test("stripLayout keeps every dot at its own x, so values stay on their side of the threshold", () => {
  const x = (v: number) => 6 + v * 288; // 0..1 on a 288px axis
  const values = [
    { runId: "a", value: 0.895 },
    { runId: "b", value: 0.905 },
    { runId: "c", value: 0.899 },
    { runId: "d", value: 0.902 },
    { runId: "e", value: 0.9 },
  ];
  const layout = stripLayout(values, x, 8, "c");
  assert.equal(layout.dots.length, 5);
  for (const dot of layout.dots) {
    assert.equal(dot.x, x(dot.value), `${dot.runId} keeps its own x`);
    assert.equal(dot.x < x(0.9), dot.value < 0.9, `${dot.runId} side`);
  }
  // Collisions resolve vertically: no two dots share a row within a diameter.
  for (const a of layout.dots)
    for (const b of layout.dots)
      if (a !== b && a.slot === b.slot)
        assert.ok(Math.abs(a.x - b.x) >= 8, `${a.runId}/${b.runId} overlap`);
  // The selected run sits on the axis.
  assert.equal(layout.dots.find((d) => d.runId === "c")!.slot, 0);
  assert.equal(layout.reach, 2);
  // Deterministic regardless of input order.
  assert.deepEqual(stripLayout([...values].reverse(), x, 8, "c"), layout);
});

test("stripLayout caps a crowded column and counts the rest, keeping the selected run", () => {
  const x = (v: number) => 6 + v * 288;
  const values = Array.from({ length: 7 }, (_, i) => ({
    runId: `r${i}`,
    value: 0.94,
  }));
  const layout = stripLayout(values, x, 8, "r6");
  assert.equal(layout.dots.length, 5);
  assert.ok(layout.dots.some((d) => d.runId === "r6" && d.slot === 0));
  assert.deepEqual(layout.overflow, [{ x: x(0.94), count: 2 }]);
  assert.deepEqual(stripLayout([], x, 8), { dots: [], overflow: [], reach: 0 });
});

test("stripScale gives finite x for subnormal, overflowing and degenerate spans", () => {
  const cases: [string, number[], number[]][] = [
    ["subnormal point", [1e-310, 1e-310], [1e-310, 0, 1]],
    ["subnormal span", [1e-310, 2e-310], [1e-310, 2e-310]],
    ["overflowing span", [-1e308, 1e308], [-1e308, 0, 1e308]],
    [
      "max magnitude",
      [-Number.MAX_VALUE, Number.MAX_VALUE],
      [Number.MAX_VALUE],
    ],
    ["single point", [5, 5], [5, 1000, -1000]],
    ["zero", [0, 0], [0]],
  ];
  for (const [name, points, probes] of cases) {
    const { min, max, x } = stripScale(points, false);
    assert.ok(Number.isFinite(min) && Number.isFinite(max), `${name} domain`);
    for (const v of [...points, ...probes]) {
      const px = x(v);
      assert.ok(
        Number.isFinite(px) && px >= 6 && px <= 294,
        `${name}: x(${v}) = ${px}`,
      );
    }
    const layout = stripLayout(
      points.map((value, i) => ({ runId: `r${i}`, value })),
      x,
      8,
    );
    for (const dot of layout.dots)
      assert.ok(Number.isFinite(dot.x), `${name} dot`);
  }
  // Ordinary spans still map ends to the padded axis and keep order.
  const { x } = stripScale([0, 10], false);
  assert.ok(x(0) < x(5) && x(5) < x(10));
  assert.equal(stripScale([0.4], true).x(1), 294);
  assert.equal(stripScale([0.4], true).x(2), 294); // clamped to the edge
});
