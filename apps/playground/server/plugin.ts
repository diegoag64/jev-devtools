import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createJevDevtools } from "jev-devtools/server";
import { readCookbook } from "./workbench.js";
import { workbenchRegistry } from "./workbench-registry.js";
import { getCookbookSample } from "./workbench-samples.js";

const send = (res: ServerResponse, status: number, data: unknown) => {
  res
    .writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    })
    .end(JSON.stringify(data));
};
const validSession = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
export function jevInspectorServer(captureLimit?: number): Plugin {
  const running = new Map<
    string,
    { session: string; controller: AbortController }
  >();

  return {
    name: "jev-inspector-server",
    apply: "serve",
    configureServer(server) {
      // Use Vite's resolved port, including CLI overrides, for both route guards.
      // Keep the trusted loopback host independent of request headers.
      const host = `127.0.0.1:${server.config.server.port ?? 4182}`;
      const origin = `http://${host}`;
      const inspector = createJevDevtools({
        enabled: true,
        origin,
        limit: captureLimit,
      });
      server.httpServer?.once("close", () => {
        for (const r of running.values()) r.controller.abort();
        inspector.dispose();
      });
      server.middlewares.use(inspector.middleware);
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next) => {
          if (!req.url?.startsWith("/__jev/")) return next();
          if (
            req.headers.host !== host ||
            (req.headers.origin && req.headers.origin !== origin) ||
            req.headers["sec-fetch-site"] === "cross-site"
          ) {
            send(res, 403, { error: "Local same-origin requests only." });
            return;
          }
          const url = new URL(req.url, origin),
            session = url.searchParams.get("session");
          if (!validSession(session)) {
            send(res, 400, { error: "A valid inspector session is required." });
            return;
          }
          if (
            req.method === "GET" &&
            url.pathname.startsWith("/__jev/cookbooks/")
          ) {
            try {
              const cookbook = await readCookbook(
                url.pathname.slice("/__jev/cookbooks/".length),
                url.searchParams.get("sample") ?? undefined,
              );
              send(
                res,
                cookbook ? 200 : 404,
                cookbook ?? { error: "Unknown cookbook" },
              );
            } catch {
              send(res, 500, {
                error: "The cookbook source could not be loaded.",
              });
            }
            return;
          }
          if (req.method !== "POST") {
            send(res, 405, { error: "Method not allowed" });
            return;
          }
          // A POST must originate in this page. The inspector never exposes a proxy
          // accepting arbitrary endpoints, headers, or API credentials from a browser.
          if (req.headers.origin !== origin) {
            send(res, 403, { error: "Same-origin POST required." });
            return;
          }
          let body: Record<string, unknown>;
          try {
            let text = "";
            for await (const chunk of req) {
              text += chunk;
              if (Buffer.byteLength(text) > 16_000) {
                send(res, 413, { error: "Request too large" });
                return;
              }
            }
            body = JSON.parse(text || "{}");
            if (!body || typeof body !== "object" || Array.isArray(body))
              throw new Error("Expected object");
          } catch {
            send(res, 400, { error: "Invalid JSON" });
            return;
          }
          if (url.pathname === "/__jev/cancel") {
            const item = running.get(
              typeof body.runId === "string" ? body.runId : "",
            );
            if (item?.session === session) item.controller.abort();
            send(res, 200, { ok: true });
            return;
          }
          if (url.pathname !== "/__jev/run") {
            send(res, 404, { error: "Not found" });
            return;
          }
          const entry = Object.entries(workbenchRegistry).find(
            ([, recipe]) => recipe.scenario === body.scenario,
          );
          const sampleId = entry && body[entry[1].caseField];
          if (
            !entry ||
            body.mode !== "sample" ||
            !validSession(body.runId) ||
            typeof sampleId !== "string" ||
            !Object.hasOwn(entry[1].samples, sampleId) ||
            body.message !== entry[1].samples[sampleId].message
          ) {
            send(res, 400, {
              error: "Choose a known cookbook sample with its fixed input.",
            });
            return;
          }
          const sample = getCookbookSample(entry[0], sampleId);
          if (!sample) {
            send(res, 400, { error: "Unknown cookbook sample." });
            return;
          }
          if (running.size >= 6 || running.has(body.runId)) {
            send(res, 429, { error: "A maximum of six runs can be active." });
            return;
          }
          const controller = new AbortController(),
            id = body.runId;
          running.set(id, { session, controller });
          try {
            const client = inspector.createClient(
              {
                apiKey: "sample-only",
                fetch: sample.fetch,
                logLevel: "off",
                retry: { maxRetries: 0 },
              },
              { source: "sample", label: sample.definition.name },
            );
            const result = await sample.run({
              client,
              devtools: inspector,
              signal: controller.signal,
            });
            send(res, 200, { ok: true, flow: result });
          } catch (error) {
            send(res, 502, {
              error: error instanceof Error ? error.name : "RequestError",
              detail: "Inspect the captured request for details.",
              cancelled: controller.signal.aborted,
            });
          } finally {
            running.delete(id);
          }
        },
      );
    },
  };
}
