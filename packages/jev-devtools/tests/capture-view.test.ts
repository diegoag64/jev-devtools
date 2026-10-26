import { defineJevFlow } from "../flow/index.js";
import { flowFixture } from "../src/flow-fixture.js";
import { traceCaptureView } from "../src/capture-view.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { score } from "@typesafe-ai/sdk";
import { createJevDevtools } from "../server/index.js";
import { RequestDetail } from "../src/JevDevtools.js";
import { TraceDiagram } from "../src/TraceDiagram.js";
import { Questions } from "../src/Questions.js";
import { createDisplayRedactor } from "../src/display-redaction.js";
import { TraceStore } from "../src/trace-store.js";

const origin = "http://localhost:5196";
const input = {
  state: { email: "personal@example.test", text: "[redacted]" },
  questions: { q: score("Rating?", ["Low", "High"]) },
};
const result = {
  model: "fixture",
  answers: {
    q: {
      type: "score",
      score: 1,
      probabilities: { "0": 0, "1": 1 },
      legend: { "0": "Low", "1": "High" },
    },
  },
  metadata: { email: "personal@example.test" },
};

// Existing redaction checks preserved JSON state fields but never rendered a
// supported transformation that changes the request root or a typed answer.
for (const mode of [
  "normal",
  "root-null",
  "request-only",
  "score-string",
  "legend-json",
] as const) {
  test(`recorder/SSE/view preserves execution and handles ${mode} capture`, async (t) => {
    const adapter = createJevDevtools({
      enabled: true,
      origin,
      redact: (path, value) =>
        (mode === "root-null" && path.length === 0) ||
        (mode === "request-only" &&
          path.length === 0 &&
          value !== null &&
          typeof value === "object" &&
          "questions" in value)
          ? null
          : mode === "legend-json" &&
              path.at(-2) === "legend" &&
              path.at(-1) === "0"
            ? { toString: null }
            : mode === "score-string" && path.at(-1) === "score"
              ? "[redacted]"
              : value,
    });
    t.after(() => adapter.dispose());
    const client = adapter.createClient({
      apiKey: "sample",
      logLevel: "off",
      fetch: async (_url, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)).state, input.state);
        return Response.json(result);
      },
    });
    assert.equal((await client.systemOne(input)).answers.q.score, 1);
    await nextTurn();
    await nextTurn();
    for (const protocol of [1, 2]) {
      const response = await adapter.handle(
        new Request(`${origin}/api/jev-devtools/events?protocol=${protocol}`, {
          headers: { origin },
        }),
      );
      const reader = response.body!.getReader();
      const { value } = await reader.read();
      await reader.cancel();
      const payload = JSON.parse(
        new TextDecoder().decode(value).split("data: ")[1],
      );
      const [trace] = new TraceStore().apply("snapshot", payload);
      assert.equal(trace.status, "success");
      for (const component of [RequestDetail, TraceDiagram, Questions])
        assert.doesNotThrow(() =>
          renderToString(createElement(component, { trace })),
        );
      const diagram = renderToString(createElement(TraceDiagram, { trace }));
      if (mode === "legend-json") {
        assert.match(diagram, /toString/);
        assert.match(diagram.replaceAll("<!-- -->", ""), /Score 1.00/);
        assert.deepEqual(trace.result?.answers.q.legend?.["0"], {
          toString: null,
        });
        assert.equal(trace.capture, undefined);
      } else if (mode === "normal") {
        assert.match(diagram.replaceAll("<!-- -->", ""), /Score 1.00/);
        assert.deepEqual(trace.request.state, input.state);
        assert.deepEqual(trace.result, result);
        assert.deepEqual(trace.captureWarnings, []);
      } else {
        assert.match(diagram, /unavailable in this capture/);
        assert.match(trace.captureWarnings.join(" "), /redacted values/);
        assert.match(
          trace.captureWarnings.join(" "),
          /structured view unavailable/,
        );
        const raw = payload.traces[0];
        if (mode === "root-null" || mode === "request-only") {
          assert.equal(raw.capture.request, null);
          assert.equal(
            raw.capture.result,
            mode === "root-null" ? null : undefined,
          );
        } else {
          assert.equal(raw.capture.result.answers.q.score, "[redacted]");
          assert.deepEqual(raw.request.state, input.state);
        }
        assert.deepEqual(
          trace.result,
          mode === "request-only" ? result : undefined,
        );
        assert.doesNotMatch(
          JSON.stringify(createDisplayRedactor().trace(trace)),
          /personal@example/,
        );
        assert.match(
          JSON.stringify(trace),
          mode === "root-null" ? /"capture"/ : /personal@example/,
        );
      }
    }
  });
}

// Older snapshots asserted SDK shapes even after root/field replacement. The
// compatibility projection must preserve raw JSON and valid-record identity.
test("legacy JSON captures render without treating user strings as metadata", () => {
  const base = {
    version: 1,
    id: "legacy",
    session: "local",
    label: "Legacy",
    source: "sample",
    startedAt: 0,
    status: "success",
    attempts: [],
    captureWarnings: [],
    request: { model: "fixture", ...input },
    result,
  };
  for (const replacement of [
    null,
    false,
    42,
    "[redacted]",
    [],
    { model: "redacted" },
  ]) {
    const [trace] = new TraceStore().apply("snapshot", {
      version: 1,
      traces: [{ ...base, request: replacement }],
    });
    assert.match(
      renderToString(createElement(RequestDetail, { trace })),
      /Request unavailable in this capture/,
    );
    const view = traceCaptureView(trace);
    assert.deepEqual(view.capture?.request, replacement);
    assert.equal(traceCaptureView(view), view);
  }
  for (const changed of [
    { ...result, answers: { q: { type: "score", score: "[redacted]" } } },
    { ...result, answers: null },
    {
      ...result,
      answers: {
        q: {
          type: "box",
          box: { left: "hidden", top: 0, right: 1, bottom: 1 },
        },
      },
    },
    { ...result, answers: { q: { type: "noul", noul: "hidden" } } },
    {
      ...result,
      answers: { q: { type: "choice", choice: {}, probabilities: { x: 1 } } },
    },
    {
      ...result,
      answers: { q: { type: "choice", probabilities: { x: "hidden" } } },
    },
    { ...result, usage: { input_tokens: "hidden", output_tokens: 1 } },
  ]) {
    const [trace] = new TraceStore().apply("snapshot", {
      version: 1,
      traces: [{ ...base, result: changed }],
    });
    assert.match(
      renderToString(createElement(TraceDiagram, { trace })),
      /Response unavailable in this capture/,
    );
    assert.deepEqual(traceCaptureView(trace).capture?.result, changed);
  }
  const [normal] = new TraceStore().apply("snapshot", {
    version: 1,
    traces: [base],
  });
  assert.equal(traceCaptureView(normal), normal);
  assert.equal(normal.capture, undefined);
  assert.match(
    renderToString(createElement(TraceDiagram, { trace: normal })),
    /\[redacted\]/,
  );
});

test("unavailable response captures remain missing fixtures with warnings while flows use actual answers", async (t) => {
  const adapter = createJevDevtools({
    enabled: true,
    origin,
    redact: (path, value) => (path.at(-1) === "score" ? "hidden" : value),
  });
  t.after(() => adapter.dispose());
  const client = adapter.createClient({
    apiKey: "sample",
    logLevel: "off",
    fetch: async () => Response.json(result),
  });
  const flow = defineJevFlow("capture-fixture", (f) => {
    const rating = f.jev("rate", input);
    return f.output("done", rating.answer("q").score);
  });
  const outcome = await flow.run(null, { client, devtools: adapter });
  assert.equal(outcome.value, 1);
  await nextTurn();
  await nextTurn();
  const read = async (path: string) => {
    const response = await adapter.handle(
      new Request(`${origin}/api/jev-devtools${path}`, { headers: { origin } }),
    );
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    return JSON.parse(new TextDecoder().decode(value).split("data: ")[1]);
  };
  const flows = await read("/flows/events");
  const snapshot = await read("/events");
  const traces = new TraceStore().apply("snapshot", snapshot);
  const built = flowFixture(
    flows.definitions[0],
    flows.upserts[0],
    new Map(traces.map((trace) => [trace.id, trace])),
  );
  assert.deepEqual(built.missing, ["rate"]);
  assert.deepEqual(built.fixture.steps, {});
  assert.match(built.warnings.join(" "), /structured view unavailable/);
  assert.match(built.warnings.join(" "), /redacted values/);
});
