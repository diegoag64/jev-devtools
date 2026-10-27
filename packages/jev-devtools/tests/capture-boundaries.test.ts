import { setImmediate as nextTurn } from "node:timers/promises";
import { score } from "@typesafe-ai/sdk";
import { TraceStore } from "../src/trace-store.js";
import { RequestDetail } from "../src/JevDevtools.js";
import { TraceDiagram } from "../src/TraceDiagram.js";
import { Questions } from "../src/Questions.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { defineJevFlow } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";
import { parseFlowUpdate } from "../src/flow-parser.js";
import { FlowOverview } from "../src/FlowOverview.js";
import { DiagramContent } from "../src/DiagramContent.js";
import type { Json } from "../src/protocol.js";

const origin = "http://localhost:5198";
const client = {
  systemOne(): never {
    throw new Error("Unexpected inference");
  },
};
const replacements: Record<string, Json> = {
  null: null,
  boolean: false,
  number: 42,
  string: "[redacted]",
  // Array coercion used to accept this as 'gt' but render another comparison.
  array: ["gt"],
  // Legal JSON can make String(value) throw; no executable code is needed.
  object: { toString: null },
};
async function readFlow(inspector: ReturnType<typeof createJevDevtools>) {
  const response = await inspector.handle(
    new Request(origin + "/api/jev-devtools/flows/events"),
  );
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  try {
    const { value } = await reader.read();
    const payload: unknown = JSON.parse(
      new TextDecoder().decode(value).split("data: ")[1],
    );
    const parsed = parseFlowUpdate(payload, new Map(), new Map());
    assert.equal(parsed.definitions.size, 1);
    assert.equal(parsed.runs.size, 1);
    return {
      definition: [...parsed.definitions.values()][0],
      run: [...parsed.runs.values()][0],
    };
  } finally {
    await reader.cancel();
  }
}

// Follow each condition through public execution, capture, SSE, validation and
// its actual renderer. A formatter-only test misses the branch shorthand path.
for (const kind of ["branch", "loop"] as const) {
  for (const [mode, replacement] of Object.entries({
    control: "gt",
    ...replacements,
  })) {
    test(`${kind} condition survives ${mode} operator capture without changing execution`, async (t) => {
      const inspector = createJevDevtools({
        enabled: true,
        origin,
        redact: (path, value) =>
          mode !== "control" &&
          path.length === 3 &&
          path[0] === "conditions" &&
          path[2] === "op"
            ? replacement
            : value,
      });
      t.after(() => inspector.dispose());
      const flow =
        kind === "branch"
          ? defineJevFlow<number>("branch-capture", (f) =>
              f.branch("decision", {
                when: f.input.gt(0),
                then: (p) => p.output("done", 0),
                else: (p) => p.output("wrong", 1),
              }),
            )
          : defineJevFlow<number>("loop-capture", (f) => {
              const state = f.loop(
                "decision",
                {
                  initial: 1,
                  input: null,
                  maxIterations: 2,
                  while: (s) => s.gt(0),
                },
                (p) =>
                  p.task("next", {
                    input: p.input.get("state"),
                    run: (n) => n - 1,
                  }),
              );
              return f.output("done", state);
            });
      const result = await flow.run(1, { client, devtools: inspector });
      assert.equal(result.outcome, "done");
      assert.equal(result.value, 0);
      const { definition, run } = await readFlow(inspector);
      assert.equal(run.steps.decision.status, "completed");
      if (kind === "branch") assert.equal(run.steps.decision.decision, true);
      const node = definition.nodes.find((n) => n.id === "decision")!;
      assert.ok(
        node.conditionRule &&
          typeof node.conditionRule === "object" &&
          !Array.isArray(node.conditionRule),
      );
      assert.deepEqual(node.conditionRule.op, replacement);
      const html = renderToString(
        createElement(FlowOverview, { definition, run, traces: [] }),
      ).replaceAll("<!-- -->", "");
      if (mode === "control") {
        assert.doesNotMatch(html, /rule unavailable/);
        assert.match(
          html,
          kind === "branch" ? /Greater than 0/ : /Continue while .*&gt; 0/,
        );
        assert.deepEqual(node.conditionCaptureWarnings ?? [], []);
      } else {
        assert.match(html, /\[rule unavailable\]/);
        assert.match(
          node.conditionCaptureWarnings!.join(" "),
          /redacted values/,
        );
      }
    });
  }
}

// Sibling boundaries deliberately keep arbitrary JSON. Preserve the captured
// value and metadata, and render it without imposing execution-time shapes.
for (const boundary of ["task", "outcome"] as const) {
  for (const [mode, replacement] of Object.entries(replacements)) {
    test(`${boundary} ${mode} capture retains JSON and full application values`, async (t) => {
      const inspector = createJevDevtools({
        enabled: true,
        origin,
        redact: (path, value) =>
          (
            boundary === "task"
              ? path.join(".") === "steps.work.data.output"
              : path.length === 0
          )
            ? replacement
            : value,
      });
      t.after(() => inspector.dispose());
      const flow = defineJevFlow<number>("data-capture", (f) => {
        const value = f.task("work", {
          input: f.input,
          run: (n) => ({ full: n }),
        });
        return f.output("done", value);
      });
      const result = await flow.run(7, { client, devtools: inspector });
      assert.deepEqual(result.value, { full: 7 });
      const { definition, run } = await readFlow(inspector);
      const data = run.steps.work.data;
      assert.ok(data && typeof data === "object" && !Array.isArray(data));
      const captured = boundary === "task" ? data.output : run.value;
      assert.deepEqual(captured, replacement);
      assert.match(
        (boundary === "task"
          ? run.steps.work.captureWarnings!
          : run.captureWarnings!
        ).join(" "),
        /redacted values/,
      );
      assert.doesNotThrow(() =>
        renderToString(
          createElement(FlowOverview, { definition, run, traces: [] }),
        ),
      );
      // These are also the content renderer used inside expanded task/outcome details.
      assert.doesNotThrow(() =>
        renderToString(
          createElement(DiagramContent, { value: captured, label: boundary }),
        ),
      );
    });
  }
}

// The request and response projection must reject incompatible SDK fields while
// preserving the transformed raw JSON. Exercise both wire protocol versions.
for (const boundary of ["request", "response", "score"] as const) {
  for (const [mode, replacement] of Object.entries(replacements)) {
    test(`${boundary} ${mode} capture renders without changing SDK values`, async (t) => {
      const input = {
        state: { full: 7 },
        questions: { q: score("Rating?", ["Low", "High"]) },
      };
      const result = {
        model: "sample",
        answers: {
          q: { type: "score", score: 1, probabilities: { "0": 0, "1": 1 } },
        },
      };
      const inspector = createJevDevtools({
        enabled: true,
        origin,
        redact: (path, value) => {
          const root =
            path.length === 0 && value !== null && typeof value === "object";
          return (
            boundary === "score"
              ? path.join(".") === "answers.q.score"
              : root &&
                (boundary === "request"
                  ? "questions" in value
                  : "answers" in value)
          )
            ? replacement
            : value;
        },
      });
      t.after(() => inspector.dispose());
      const sdk = inspector.createClient({
        apiKey: "sample",
        logLevel: "off",
        fetch: async (_url, init) => {
          assert.deepEqual(JSON.parse(String(init?.body)).state, input.state);
          return Response.json(result);
        },
      });
      assert.equal((await sdk.systemOne(input)).answers.q.score, 1);
      await nextTurn();
      await nextTurn();
      for (const protocol of [1, 2]) {
        const response = await inspector.handle(
          new Request(
            `${origin}/api/jev-devtools/events?protocol=${protocol}`,
            { headers: { origin } },
          ),
        );
        const reader = response.body!.getReader();
        const { value } = await reader.read();
        await reader.cancel();
        const [trace] = new TraceStore().apply(
          "snapshot",
          JSON.parse(new TextDecoder().decode(value).split("data: ")[1]),
        );
        assert.equal(trace.status, "success");
        // A finite number remains a valid score, even though the capture differs.
        const validScore =
          boundary === "score" && typeof replacement === "number";
        if (boundary === "request")
          assert.deepEqual(trace.capture?.request, replacement);
        else if (boundary === "response")
          assert.deepEqual(trace.capture?.result, replacement);
        else if (validScore)
          assert.equal(trace.result?.answers.q.score, replacement);
        else {
          const captured = trace.capture?.result;
          assert.ok(
            captured &&
              typeof captured === "object" &&
              !Array.isArray(captured),
          );
          assert.deepEqual(captured, {
            ...result,
            answers: { q: { ...result.answers.q, score: replacement } },
          });
        }
        assert.match(trace.captureWarnings.join(" "), /redacted values/);
        for (const component of [RequestDetail, TraceDiagram, Questions]) {
          const html = renderToString(createElement(component, { trace }));
          if (component === TraceDiagram && !validScore)
            assert.match(html, /unavailable in this capture/);
        }
      }
    });
  }
}
