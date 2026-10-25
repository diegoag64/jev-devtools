// Sample-only production bundle harness for local flow correctness and scaling.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "vite";
import { choice, noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";
import {
  refundFlow,
  parallelFlow,
  flowTransport,
} from "../apps/playground/server/flows.ts";
const port = Number(process.env.FLOW_PORT ?? 4230);
let origin, inspector;
const out = resolve(
  process.env.FLOW_OUT ?? "benchmarks/results/flows-browser-" + process.pid,
);
await build({
  root: resolve("benchmarks/flow-browser"),
  configFile: false,
  build: { outDir: out, emptyOutDir: true },
  define: { "process.env.NODE_ENV": '"production"' },
});
const running = new Set();
// A real lossy rule capture that used to expand the card enough to make the
// fitted diagram (including its warning) unreadably small.
const warningFlow = defineJevFlow("capture-warning", (flow) =>
  flow.branch("long-rule", {
    when: flow.input.get("message").eq("x".repeat(20_000)),
    then: (branch) => branch.output("matched"),
    else: (branch) => branch.output("different"),
  }),
);
const categories = Object.fromEntries(
  Array.from({ length: 150 }, (_, i) => [`category-${i + 1}`, null]),
);
const largeChoice = defineJevFlow("large-choice", (flow) => {
  const classified = flow.jev("classify", {
    state: flow.input,
    questions: { category: choice("Classify the sample", categories) },
  });
  const checked = flow.jev("check", {
    state: classified.answer("category").choice,
    questions: { eligible: noul("Eligible?") },
  });
  return flow.output("done", checked.answer("eligible").noul);
});
// A request-free graph reproduces first-click focusing when no step starts selected.
const taskSelectionFlow = defineJevFlow("task-selection", (flow) => {
  let value = flow.input;
  for (let index = 0; index < 6; index++) {
    value = flow.task(`task-${index}`, { input: value, run: (input) => input });
  }
  return flow.output("tasks-done", value);
});
const contentFlow = defineJevFlow("structured-content", (flow) => {
  const result = flow.jev("content", {
    state: {
      message: "Root text must not hide sibling properties.",
      ticket: {
        message:
          "A long captured message. ".repeat(30) + "END OF CAPTURED TEXT",
      },
      eligibility: 0.94,
      flagged: false,
      missing: null,
      empty: {},
      items: Array.from({ length: 20 }, (_, index) => ({
        label: `Item ${index}`,
        value: index,
      })),
    },
    questions: {
      eligible: noul({
        task: "Review the ticket",
        rules: ["Check eligibility", "Check risk"],
      }),
    },
  });
  return flow.output("done", result.answer("eligible").noul);
});
const scales = new Map(
  [10, 50, 150].map((count) => [
    count,
    defineJevFlow("scale-" + count, (f) => {
      let state = f.input;
      for (let i = 0; i < count; i++) {
        state = f
          .jev("step-" + i, {
            state: { value: state },
            questions: { eligible: noul("Eligible?") },
          })
          .answer("eligible").noul;
      }
      return f.output("done", state);
    }),
  ]),
);
const server = createServer((req, res) => {
  inspector.middleware(
    req,
    res,
    () =>
      void (async () => {
        try {
          const url = new URL(req.url, origin);
          if (url.pathname === "/ready") {
            res.end("ready");
            return;
          }
          if (req.method === "POST") {
            if (req.headers.origin !== origin) {
              res.writeHead(403);
              res.end();
              return;
            }
            if (url.pathname === "/cancel") {
              for (const c of running) c.abort();
              res.end("{}");
              return;
            }
            if (url.pathname === "/run") {
              const scenario = url.searchParams.get("scenario");
              const flow =
                scenario === "flow-tasks"
                  ? taskSelectionFlow
                  : scenario === "flow-warning"
                    ? warningFlow
                    : scenario === "flow-content"
                      ? contentFlow
                      : scenario?.startsWith("scale-")
                        ? scales.get(Number(scenario.slice(6)))
                        : scenario === "flow-parallel"
                          ? parallelFlow
                          : scenario === "flow-large-choice"
                            ? largeChoice
                            : refundFlow;
              if (!flow || running.size > 5) throw new Error("Invalid flow");
              const controller = new AbortController();
              running.add(controller);
              try {
                const client = inspector.createClient(
                  {
                    apiKey: "sample-only",
                    compression: false,
                    logLevel: "off",
                    retry: { maxRetries: 0 },
                    fetch: scenario?.startsWith("scale-")
                      ? async () =>
                          Response.json({
                            model: "sample",
                            answers: { eligible: { type: "noul", noul: 0.9 } },
                          })
                      : scenario === "flow-large-choice"
                        ? async (_url, init) => {
                            const request = JSON.parse(String(init.body));
                            return Response.json({
                              model: "sample",
                              answers: request.questions.category
                                ? {
                                    category: {
                                      type: "choice",
                                      choice: "category-1",
                                      probabilities: Object.fromEntries(
                                        Object.keys(categories).map(
                                          (key, i) => [key, (150 - i) / 11325],
                                        ),
                                      ),
                                    },
                                  }
                                : { eligible: { type: "noul", noul: 0.9 } },
                            });
                          }
                        : flowTransport(scenario),
                  },
                  { source: "sample", label: flow.definition.name },
                );
                const count = Number(url.searchParams.get("count") ?? 1);
                if (!Number.isInteger(count) || count < 1 || count > 200)
                  throw new Error("Invalid count");
                const started = performance.now();
                let result;
                for (let i = 0; i < count; i++)
                  result = await flow.run(
                    { message: "Sample refund" },
                    { client, devtools: inspector, signal: controller.signal },
                  );
                res.setHeader("content-type", "application/json");
                res.end(
                  JSON.stringify({
                    ...result,
                    serverExecutionMs: performance.now() - started,
                  }),
                );
              } catch (error) {
                res.end(
                  JSON.stringify({
                    error: controller.signal.aborted ? "cancelled" : error.name,
                  }),
                );
              } finally {
                running.delete(controller);
              }
              return;
            }
          }
          const file =
            url.pathname === "/" ? "index.html" : url.pathname.slice(1);
          if (file.includes("..")) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.setHeader(
            "content-type",
            file.endsWith(".js")
              ? "text/javascript"
              : file.endsWith(".css")
                ? "text/css"
                : "text/html",
          );
          res.end(await readFile(join(out, file)));
        } catch {
          res.writeHead(500);
          res.end("error");
        }
      })(),
  );
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
origin = `http://127.0.0.1:${server.address().port}`;
inspector = createJevDevtools({ enabled: true, origin, limit: 200 });
console.log(origin);
process.send?.({ origin });
const stop = () => {
  for (const c of running) c.abort();
  inspector.dispose();
  server.close();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
