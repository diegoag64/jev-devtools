import { defineJevFlow } from "../flow/index.js";
import { flowFixture } from "../src/flow-fixture.js";
import {
  captureFieldUnavailable,
  traceCaptureView,
} from "../src/capture-view.js";
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
  questions: {
    q: score("Rating?", ["Low", "High"]),
    other: score("Other rating?", ["Low", "High"]),
  },
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
    other: { type: "score", score: 0, probabilities: { "0": 1, "1": 0 } },
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
            : mode === "score-string" &&
                path.at(-2) === "q" &&
                path.at(-1) === "score"
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
      const diagram = renderToString(
        createElement(TraceDiagram, { trace }),
      ).replaceAll("<!-- -->", "");
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
        if (mode === "score-string") {
          assert.match(diagram, /Score unavailable in this capture/);
          assert.match(diagram, /Rating\?/);
          assert.match(diagram, /High/);
          assert.doesNotMatch(diagram, /RETURNED SCORE/);
          const view = traceCaptureView(trace);
          assert.equal(view.result?.answers.other.score, 0);
          assert.equal(view.result?.answers.q.score, undefined);
          assert.equal(view.result?.answers.q.probabilities?.["1"], 1);
        }
        if (mode === "request-only")
          assert.match(diagram.replaceAll("<!-- -->", ""), /Score 1.00/);
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
      /unavailable in this capture/,
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
    {
      ...result,
      answers: {
        q: {
          type: "score",
          score: 1,
          probabilities: { "0": "hidden", "1": 0.8 },
        },
      },
    },
  ]) {
    const [trace] = new TraceStore().apply("snapshot", {
      version: 1,
      traces: [{ ...base, result: changed }],
    });
    assert.match(
      renderToString(createElement(RequestDetail, { trace })),
      /unavailable/i,
    );
    assert.deepEqual(traceCaptureView(trace).capture?.result, changed);
    const diagram = renderToString(
      createElement(TraceDiagram, { trace }),
    ).replaceAll("<!-- -->", "");
    if (changed.answers?.q && "box" in changed.answers.q) {
      assert.match(diagram, /top 0.00 · right 1.00 · bottom 1.00/);
      assert.doesNotMatch(diagram, /class="lab-box"/);
    }
    if (
      changed.answers?.q &&
      "probabilities" in changed.answers.q &&
      changed.answers.q.probabilities?.["0"] === "hidden"
    ) {
      assert.match(diagram, /Score 1.00/);
      assert.match(diagram, /Score scale unavailable/);
      assert.doesNotMatch(diagram, /class="lab-scale"/);
    }
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
  const displayed = flowFixture(
    flows.definitions[0],
    flows.upserts[0],
    new Map(traces.map((trace) => [trace.id, traceCaptureView(trace)])),
  );
  assert.deepEqual(displayed.missing, ["rate"]);
  assert.deepEqual(displayed.fixture.steps, {});
  assert.deepEqual(built.missing, ["rate"]);
  assert.deepEqual(built.fixture.steps, {});
  assert.match(built.warnings.join(" "), /structured view unavailable/);
  assert.match(built.warnings.join(" "), /redacted values/);
});

// A single incompatible field used to hide the entire response. Exercise the
// browser projection from wire JSON so legacy and current captures share proof.
test("partial capture fields preserve siblings without inventing numeric values", () => {
  const request = {
    model: 42,
    ...input,
    questions: {
      ...input.questions,
      q: { type: null, instructions: "Retained instructions" },
    },
  };
  const response = {
    model: "fixture",
    answers: {
      q: {
        type: "score",
        score: "hidden",
        confidence: 0.75,
        probabilities: { "0": "hidden", "1": 0.8 },
      },
      other: result.answers.other,
      region: {
        type: "box",
        box: { left: "hidden", top: 0.2, right: 0.9, bottom: 0.8 },
      },
      hidden: null,
    },
    usage: { input_tokens: "hidden", output_tokens: 19 },
  };
  const [trace] = new TraceStore().apply("snapshot", {
    version: 1,
    traces: [
      {
        version: 1,
        id: "partial",
        session: "local",
        label: "Partial",
        source: "sample",
        startedAt: 0,
        status: "success",
        attempts: [],
        captureWarnings: [],
        request,
        result: response,
      },
    ],
  });
  const view = traceCaptureView(trace);
  assert.equal(view.result?.answers.q.confidence, 0.75);
  assert.deepEqual(view.result?.answers.q.probabilities, { "1": 0.8 });
  assert.equal(view.result?.answers.other.score, 0);
  assert.equal(view.result?.answers.region.box, undefined);
  assert.equal(
    captureFieldUnavailable(view, ["result", "answers", "q", "score"]),
    true,
  );
  assert.equal(
    captureFieldUnavailable(view, ["result", "answers", "other", "score"]),
    false,
  );
  const html = renderToString(
    createElement(RequestDetail, { trace }),
  ).replaceAll("<!-- -->", "");
  assert.match(html, /Score unavailable in this capture/);
  assert.match(html, /Probabilities · 0 unavailable in this capture/);
  assert.match(html, /Retained instructions/);
  assert.match(html, /Confidence 75%/);
  assert.match(html, /80%/);
  assert.match(html, /Unavailable \/ 19/);
  assert.doesNotMatch(html, /RETURNED SCORE|Score 0.00/);
  assert.deepEqual(view.capture?.request, request);
  assert.deepEqual(view.capture?.result, response);
  const masked = createDisplayRedactor().trace(view);
  const maskedView = traceCaptureView(masked);
  assert.equal(
    captureFieldUnavailable(maskedView, ["result", "answers", "q", "score"]),
    true,
  );
  assert.doesNotMatch(JSON.stringify(maskedView), /personal@example/);
});

// Generic masking of fallback JSON used to erase SDK map entries whose names
// resemble personal fields, hiding usable siblings after partial projection.
test("partial captures preserve structural names while masking personal content", () => {
  const request = {
    model: null,
    state: { email: "private@example.test" },
    questions: {
      email: {
        type: "choice",
        instructions: { phone: "private-phone" },
        criteria: { email: "Email category", phone: "Phone category" },
      },
      phone: { type: "score", instructions: "Other answer" },
    },
    assets: { email: { description: "Asset kept", phone: "private-phone" } },
  };
  const result = {
    model: "fixture",
    answers: {
      email: {
        type: "choice",
        choice: "email",
        probabilities: { email: 0.7, phone: 0.3 },
        confidence: "hidden",
        legend: {
          phone: { email: "private@example.test", text: "Legend kept" },
        },
      },
      phone: { type: "score", score: 2 },
    },
    metadata: { email: "private@example.test" },
  };
  const [trace] = new TraceStore().apply("snapshot", {
    version: 1,
    traces: [
      {
        version: 1,
        id: "structural-names",
        session: "local",
        label: "Structural names",
        source: "sample",
        startedAt: 0,
        status: "success",
        attempts: [],
        captureWarnings: [],
        request,
        result,
      },
    ],
  });
  const unmasked = traceCaptureView(trace);
  const redactor = createDisplayRedactor();
  const masked = redactor.trace(unmasked);
  const view = traceCaptureView(masked);
  assert.equal(view.request.questions.email.type, "choice");
  assert.deepEqual(view.request.questions.email.criteria, {
    email: "Email category",
    phone: "Phone category",
  });
  assert.deepEqual(view.request.assets, {
    email: { description: "Asset kept", phone: "[redacted]" },
  });
  assert.equal(view.result?.answers.email.choice, "email");
  assert.deepEqual(view.result?.answers.email.probabilities, {
    email: 0.7,
    phone: 0.3,
  });
  assert.deepEqual(view.result?.answers.email.legend, {
    phone: { email: "[redacted]", text: "Legend kept" },
  });
  assert.equal(view.result?.answers.phone.score, 2);
  assert.equal(
    captureFieldUnavailable(view, ["result", "answers", "email", "confidence"]),
    true,
  );
  assert.doesNotMatch(JSON.stringify(view), /private@example|private-phone/);
  assert.equal(redactor.trace(unmasked), masked);
  assert.deepEqual(unmasked.capture?.request, request);
  assert.deepEqual(unmasked.capture?.result, result);
  assert.match(JSON.stringify(unmasked), /private@example/);
});
