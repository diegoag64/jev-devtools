import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { defineJevFlow } from "jev-devtools/flow";
import { choice } from "@typesafe-ai/sdk";
import { scenarios, recordedFixture, fixture, invoke } from "./fixtures.mjs";
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.BENCH_PORT || 4190);
// Keep paired revisions from overwriting each other's production assets.
const outDir = join(root, "results", `browser-${port}`);
const transportMode = process.env.BENCH_LIVE === "1" ? "adapter" : "replay";
const revision = process.env.BENCH_REVISION || "working-tree";
const profiling = process.env.BENCH_PROFILE === "1";
const { createJevDevtools } = await import(
  process.env.BENCH_SERVER_ENTRY
    ? pathToFileURL(process.env.BENCH_SERVER_ENTRY).href
    : "jev-devtools/server"
);
const adapters = new Map();
const counters = { sent: 0, bytes: 0 };
const active = new Map();
const datasets = new Map();
const redactionFlow = defineJevFlow("display-redaction", (flow) => {
  const copy = flow.task("email", { input: flow.input, run: (value) => value });
  return flow.output("done", copy);
});
for (const spec of scenarios) {
  const { snapshot } = await recordedFixture(spec);
  const payload = JSON.stringify(snapshot);
  datasets.set(spec.id, { payload, spec, bytes: Buffer.byteLength(payload) });
  if (transportMode === "adapter") {
    const adapter = createJevDevtools({
      enabled: true,
      origin: `http://127.0.0.1:${port}`,
      endpoint: `/api/${spec.id}`,
      limit: spec.history,
    });
    const { request, clientOptions } = fixture(spec);
    let sequence = 0,
      responseDelay = 0;
    const fetchSample = clientOptions.fetch;
    clientOptions.fetch = async (...args) => {
      if (responseDelay)
        await new Promise((resolve) => setTimeout(resolve, responseDelay));
      const response = await fetchSample(...args);
      response.headers.set("x-typesafe-request-id", `benchmark-${++sequence}`);
      return response;
    };
    const client = adapter.createClient(clientOptions, {
      source: "sample",
      label: `Sample ${spec.history}`,
    });
    for (let i = 0; i < spec.history; i++) await invoke(client, request);
    adapters.set(spec.id, {
      adapter,
      client,
      request,
      requestId: () => `benchmark-${sequence}`,
      setDelay: (ms) => {
        responseDelay = ms;
      },
    });
  }
}
await build({
  root: join(root, "browser"),
  configFile: false,
  resolve: {
    alias: [
      ...(process.env.BENCH_CLIENT_ENTRY
        ? [
            {
              find: /^jev-devtools$/,
              replacement: process.env.BENCH_CLIENT_ENTRY,
            },
          ]
        : []),
      ...(profiling
        ? [{ find: /^react-dom\/client$/, replacement: "react-dom/profiling" }]
        : []),
    ],
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    minify: profiling ? false : undefined,
  },
  define: {
    "process.env.NODE_ENV": '"production"',
    __BENCH_PROFILE__: JSON.stringify(profiling),
  },
});
const streams = new Set();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/bench/info") {
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify(
          [...datasets].map(([id, d]) => ({
            ...d.spec,
            bytes: d.bytes,
            transportMode,
            revision,
            profiling,
          })),
        ),
      );
    }
    if (url.pathname === "/bench/results" && req.method === "POST") {
      if (req.headers.origin !== `http://127.0.0.1:${port}`) {
        res.writeHead(403);
        return res.end();
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2_000_000) throw new Error("Result too large");
      }
      const result = JSON.parse(body);
      await mkdir(join(root, "results"), { recursive: true });
      const text = JSON.stringify(result, null, 2) + "\n";
      const name = String(result.timestamp).replace(/[^0-9TZ-]/g, "-");
      await writeFile(join(root, "results", `browser-${name}.json`), text);
      await writeFile(join(root, "results", "browser.json"), text);
      return res.end("saved");
    }
    if (url.pathname === "/bench/counters") {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      return res.end(JSON.stringify(counters));
    }
    const match = url.pathname.match(
      /^\/api\/([a-z-]+)(\/events|\/clear|\/flows\/events)?$/,
    );
    if (match && datasets.has(match[1])) {
      const dataset = datasets.get(match[1]);
      if (transportMode === "adapter") {
        if (match[2] === "/events") {
          const id = match[1];
          active.set(id, (active.get(id) || 0) + 1);
          req.on("close", () => {
            const n = (active.get(id) || 1) - 1;
            if (n) active.set(id, n);
            else active.delete(id);
          });
          const write = res.write.bind(res);
          res.write = (chunk, ...args) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            counters.bytes += bytes.byteLength;
            if (
              /^event: (snapshot|delta)\n/.test(
                bytes.subarray(0, 20).toString(),
              )
            )
              counters.sent++;
            return write(chunk, ...args);
          };
        }
        await adapters
          .get(match[1])
          .adapter.middleware(req, res, () => res.writeHead(404).end());
        return;
      }
      if (match[2] === "/clear") {
        res.writeHead(405);
        return res.end("Replay fixtures cannot be cleared");
      }
      if (!match[2]) {
        res.setHeader("content-type", "application/json");
        return res.end('{"version":1,"enabled":true}');
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      });
      const entry = { res, dataset };
      streams.add(entry);
      res.write(`event: snapshot\ndata: ${dataset.payload}\n\n`);
      req.on("close", () => streams.delete(entry));
      return;
    }
    if (
      url.pathname === "/bench/redaction" &&
      req.method === "POST" &&
      transportMode === "adapter"
    ) {
      if (req.headers.origin !== `http://127.0.0.1:${port}`) {
        res.writeHead(403);
        return res.end();
      }
      // Independent synthetic capture for the display-prop browser regression;
      // benchmark workloads and production APIs do not need a test-only hook.
      const { adapter, client } = adapters.get("small");
      const state = {
        email: "browser-personal@example.test",
        client_secret: "browser-credential-sentinel",
        customerId: "browser-public-customer",
      };
      const requestId = "redaction-structural-keys";
      const captureClient = adapter.createClient(
        {
          apiKey: "sample",
          logLevel: "off",
          fetch: async () =>
            Response.json(
              {
                model: "fixture",
                answers: {
                  email: {
                    type: "choice",
                    choice: "email",
                    confidence: 0.8,
                    probabilities: { email: 0.8, phone: 0.2 },
                  },
                },
              },
              { headers: { "x-typesafe-request-id": requestId } },
            ),
        },
        { source: "sample", label: "Display redaction" },
      );
      await invoke(captureClient, {
        state,
        questions: {
          email: choice(
            { prompt: "Preferred contact method?", ...state },
            {
              email: { description: "Email reply", ...state },
              phone: "Phone reply",
            },
          ),
        },
      });
      await redactionFlow.run(state, { client, devtools: adapter });
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ requestId }));
    }
    if (url.pathname === "/bench/pulse" && req.method === "POST") {
      if (req.headers.origin !== `http://127.0.0.1:${port}`) {
        res.writeHead(403);
        return res.end();
      }
      if (transportMode === "adapter") {
        // Optional local sample delay lets UI checks inspect a pending trace.
        const delay = Number(url.searchParams.get("delay") || 0);
        if (!Number.isInteger(delay) || delay < 0 || delay > 1000) {
          res.writeHead(400);
          return res.end("Invalid sample delay");
        }
        let calls = 0;
        const completed = {};
        for (const id of active.keys()) {
          const { client, request, setDelay } = adapters.get(id);
          setDelay(delay);
          try {
            await invoke(client, request);
          } finally {
            setDelay(0);
          }
          calls++;
          completed[id] = adapters.get(id).requestId();
        }
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ sent: 0, bytes: 0, calls, completed }));
      }
      let sent = 0,
        bytes = 0;
      for (const { res: target, dataset } of streams) {
        if (!target.writableNeedDrain) {
          target.write(`event: snapshot\ndata: ${dataset.payload}\n\n`);
          sent++;
          bytes += dataset.bytes;
        }
      }
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ sent, bytes }));
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!/^\/(index\.html|assets\/[\w.-]+)$/.test(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader(
      "content-type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".map")
          ? "application/json"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html",
    );
    res.end(await readFile(join(outDir, file)));
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Benchmark: http://127.0.0.1:${port}/ (production React, ${transportMode}, deterministic samples)`,
  ),
);
