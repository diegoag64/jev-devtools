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
for (const mode of ["normal", "root-null", "score-string"] as const) {
  test(`recorder/SSE/view preserves execution and handles ${mode} capture`, async (t) => {
    const adapter = createJevDevtools({
      enabled: true,
      origin,
      redact: (path, value) =>
        mode === "root-null" && path.length === 0
          ? null
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
      if (mode === "normal") {
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
        if (mode === "root-null") {
          assert.equal(raw.capture.request, null);
          assert.equal(raw.capture.result, null);
        } else {
          assert.equal(raw.capture.result.answers.q.score, "[redacted]");
          assert.deepEqual(raw.request.state, input.state);
        }
        assert.equal(trace.result, undefined);
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
