import {
  refundFlow,
  parallelFlow,
  skillShortlistFlow,
  flowTransport,
} from "./flows.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

import { createJevDevtools } from "jev-devtools/server";
import { makeRequest, sampleTransport } from "./scenarios.ts";
import { sampleProfiles, type SampleProfile } from "../src/sample-profiles.js";
import { validStress, type StressOptions } from "../src/stress-options.js";
import type { Scenario } from "./scenarios.ts";

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
export function jevInspectorServer(apiKey?: string): Plugin {
  const inspector = createJevDevtools({
    enabled: true,
    origin: "http://127.0.0.1:4182",
    redact: (path, value) => (path.at(-1) === "email" ? "[redacted]" : value),
  });
  const running = new Map<
    string,
    { session: string; controller: AbortController }
  >();

  return {
    name: "jev-inspector-server",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("close", () => {
        for (const r of running.values()) r.controller.abort();
        inspector.dispose();
      });
      server.middlewares.use(inspector.middleware);
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next) => {
          if (!req.url?.startsWith("/__jev/")) return next();
          const origin = "http://127.0.0.1:4182";
          if (
            req.headers.host !== "127.0.0.1:4182" ||
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
          if (req.method === "GET" && url.pathname === "/__jev/config") {
            send(res, 200, { liveAvailable: !!apiKey, version: 1 });
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
          let body: {
            scenario?: string;
            mode?: string;
            message?: string;
            runId?: string;
            profile?: SampleProfile;
            stress?: StressOptions;
          };
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
            const item = running.get(body.runId || "");
            if (item?.session === session) item.controller.abort();
            send(res, 200, { ok: true });
            return;
          }
          if (url.pathname !== "/__jev/run") {
            send(res, 404, { error: "Not found" });
            return;
          }
          if (
            ![
              "triage",
              "image",
              "retry",
              "error",
              "stress",
              "flow-approve",
              "flow-functions",
              "flow-manual",
              "flow-other",
              "flow-parallel",
              "flow-error",
              "flow-cancel",
            ].includes(body.scenario || "") ||
            !["sample", "live"].includes(body.mode || "") ||
            !validSession(body.runId) ||
            typeof body.message !== "string" ||
            body.message.length > 8000 ||
            (body.scenario === "stress" && !validStress(body.stress)) ||
            (body.profile !== undefined &&
              (typeof body.profile !== "string" ||
                !Object.hasOwn(sampleProfiles, body.profile)))
          ) {
            send(res, 400, {
              error: "Invalid scenario, mode, message, or run ID.",
            });
            return;
          }
          if (body.mode === "live" && !apiKey) {
            send(res, 409, {
              error: "Set TYPESAFE_API_KEY on the server to enable live calls.",
            });
            return;
          }
          if (
            body.mode === "live" &&
            (["retry", "error", "stress"].includes(body.scenario!) ||
              body.scenario!.startsWith("flow-"))
          ) {
            send(res, 400, {
              error:
                "Error and sandbox scenarios use the sample transport only.",
            });
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
            if (body.scenario!.startsWith("flow-")) {
              const flow =
                body.scenario === "flow-functions"
                  ? skillShortlistFlow
                  : body.scenario === "flow-parallel"
                    ? parallelFlow
                    : refundFlow;
              const client = inspector.createClient(
                {
                  apiKey: "sample-only",
                  fetch: flowTransport(body.scenario!),
                  logLevel: "off",
                  retry: { maxRetries: 0 },
                },
                { label: flow.definition.name, source: "sample" },
              );
              const result = await flow.run(
                { message: body.message },
                { client, devtools: inspector, signal: controller.signal },
              );
              send(res, 200, { ok: true, flow: result });
              return;
            }
            const request = await makeRequest(
              body.scenario! as Scenario,
              body.message,
              body.stress,
            );
            const client = inspector.createClient(
              {
                apiKey: body.mode === "live" ? apiKey : "sample-not-a-real-key",
                fetch:
                  body.mode === "live"
                    ? globalThis.fetch
                    : sampleTransport(
                        body.scenario! as Scenario,
                        body.profile,
                        body.stress,
                      ),
                logLevel: "off",
                retry: { maxRetries: body.scenario === "retry" ? 1 : 0 },
                defaultHeaders:
                  body.scenario === "image"
                    ? { "TypeSafe-Danger-Zone-Images": "true" }
                    : {},
              },
              {
                label:
                  body.scenario === "stress"
                    ? `Sandbox · ${body.stress!.choices} choices`
                    : body.scenario === "image"
                      ? "Locate a mug"
                      : body.scenario === "retry"
                        ? "Recover from rate limit"
                        : body.scenario === "error"
                          ? "Inspect a failed request"
                          : "Triage a support message",
                source: body.mode as "sample" | "live",
              },
            );
            const response = await client.systemOne(request, {
              signal: controller.signal,
            });
            send(res, 200, {
              ok: true,
              answerCount: Object.keys(response.answers).length,
              result: { model: response.model, answers: response.answers },
            });
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
