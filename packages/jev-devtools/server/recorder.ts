import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Image, TypeSafeClient } from "@typesafe-ai/sdk";
import type {
  Fetch,
  Questions,
  SystemOneRequest,
  RequestOptions,
} from "@typesafe-ai/sdk";
import type { Json, Trace } from "../src/protocol.js";

// Whole field names only: tokenCount, sessionId, apiKeyName, etc. stay useful.
// Keep the documented lists in docs/integration.md aligned with these policies.
const credentialKeys = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "cookies",
  "setcookie",
  "apikey",
  "xapikey",
  "password",
  "passwd",
  "passphrase",
  "secret",
  "clientsecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "authtoken",
  "xauthtoken",
  "xaccesstoken",
  "idtoken",
  "bearertoken",
  "privatekey",
  "secretkey",
]);
const safeMessage = (value: string) =>
  value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
export type CaptureOptions = {
  limit?: number;
  redact?: (path: string[], value: unknown) => unknown;
};

// Snapshot before the caller can mutate its request. Bounded and cycle-safe;
// image handles become explicit previews/references instead of opaque SDK objects.
export function capture(
  value: unknown,
  warnings: Set<string>,
  redact?: CaptureOptions["redact"],
): Json {
  const seen = new WeakSet<object>();
  let budget = 96_000;
  const visit = (input: unknown, path: string[], depth: number): Json => {
    const key = (path.at(-1) ?? "").replace(/[-_]/g, "").toLowerCase();
    if (credentialKeys.has(key)) return "[redacted]";
    if (redact) input = redact(path, input);
    budget -= 8 + (path.at(-1)?.length ?? 0);
    if (budget <= 0 || depth > 12) {
      warnings.add("Capture size/depth limit reached.");
      return "[truncated]";
    }
    if (input === null || input === undefined) return null;
    if (typeof input === "string") {
      const text = input.slice(0, Math.min(budget, 16_000));
      budget -= text.length;
      if (text.length < input.length)
        warnings.add("Long text truncated in capture.");
      return text;
    }
    if (typeof input === "boolean") return input;
    if (typeof input === "number")
      return Number.isFinite(input) ? input : String(input);
    if (typeof input !== "object") return String(input);
    if (seen.has(input)) return "[circular/repeated reference]";
    seen.add(input);
    if (input instanceof Image) {
      const bytes = input.data,
        result: { [key: string]: Json } = {
          kind: "image",
          ref: String(input),
          bytes: bytes instanceof Blob ? bytes.size : bytes.byteLength,
        };
      if (
        bytes instanceof Uint8Array &&
        bytes.byteLength < 48_000 &&
        budget > bytes.byteLength * 1.4
      ) {
        const format =
          bytes[0] === 137 && bytes[1] === 80
            ? "png"
            : bytes[0] === 255 && bytes[1] === 216
              ? "jpeg"
              : null;
        if (format) {
          result.preview = `data:image/${format};base64,${Buffer.from(bytes).toString("base64")}`;
          budget -= bytes.byteLength * 1.4;
        }
      }
      if (!result.preview)
        warnings.add(
          "Image preview omitted (Blob, unsupported format, or size limit).",
        );
      return result;
    }
    if (Array.isArray(input)) {
      if (input.length > 150)
        warnings.add("Long collection truncated in capture.");
      return input
        .slice(0, 150)
        .map((v, i) => visit(v, [...path, String(i)], depth + 1));
    }
    const entries = Object.entries(input);
    // Choice maps need room for the full roster; retain the overall byte/depth
    // budget and the smaller general-purpose object/array limit.
    const entryLimit = ["criteria", "probabilities"].includes(path.at(-1) ?? "")
      ? 256
      : 150;
    if (entries.length > entryLimit)
      warnings.add("Long collection truncated in capture.");
    return Object.fromEntries(
      entries
        .slice(0, entryLimit)
        .map(([key, v]) => [key, visit(v, [...path, key], depth + 1)]),
    );
  };
  return visit(value, [], 0);
}

export class JevRecorder {
  private traces = new Map<string, Trace>();
  private listeners = new Set<(sessions: ReadonlySet<string>) => void>();
  private revision = 0;
  private revisions = new WeakMap<Trace, number>();
  private context = new AsyncLocalStorage<string>();
  private flowContext = new AsyncLocalStorage<{
    link: NonNullable<Trace["flow"]>;
    onTrace: (id: string) => void;
  }>();
  withFlow<T>(
    link: NonNullable<Trace["flow"]>,
    onTrace: (id: string) => void,
    callback: () => T,
  ): T {
    return this.flowContext.run({ link, onTrace }, callback);
  }
  private limit: number;
  constructor(private options: CaptureOptions = {}) {
    this.limit = Math.max(1, Math.min(200, options.limit ?? 50));
  }
  snapshot(session: string) {
    return structuredClone(
      [...this.traces.values()].filter((t) => t.session === session).reverse(),
    );
  }
  // Only changed payloads are cloned. IDs/order are bounded by the retained
  // history; no tombstone log or per-session history cache is needed.
  changes(session: string, after?: number) {
    const current = [...this.traces.values()]
      .filter((t) => t.session === session)
      .reverse();
    return {
      revision: this.revision,
      order: current.map((t) => t.id),
      upserts: structuredClone(
        current.filter(
          (t) => after === undefined || this.revisions.get(t)! > after,
        ),
      ),
    };
  }
  subscribe(listener: (sessions: ReadonlySet<string>) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  clear(session: string) {
    let changed = false;
    for (const [id, t] of this.traces)
      if (t.session === session) {
        this.traces.delete(id);
        changed = true;
      }
    if (changed) {
      this.revision++;
      this.notify(new Set([session]));
    }
  }
  private notify(sessions: ReadonlySet<string>) {
    for (const listener of this.listeners) {
      try {
        listener(sessions);
      } catch {
        /* Observers must not affect inference. */
      }
    }
  }
  private update(id: string, update: (trace: Trace) => void) {
    const t = this.traces.get(id);
    if (t) {
      update(t);
      this.revisions.set(t, ++this.revision);
      this.notify(new Set([t.session]));
    }
  }

  // Use this in TypeSafeClient's supported `fetch` option. It observes attempts
  // only and returns the original Response without reading or changing its body.
  transport(fetcher: Fetch): Fetch {
    return async (url, init) => {
      const id = this.context.getStore();
      if (!id) return fetcher(url, init);
      const attempt = {
          number: (this.traces.get(id)?.attempts.length ?? 0) + 1,
        } as Trace["attempts"][number],
        started = performance.now();
      this.update(id, (t) => {
        t.attempts.push(attempt);
      });
      try {
        const response = await fetcher(url, init);
        this.update(id, () => {
          attempt.durationMs = performance.now() - started;
          attempt.status = response.status;
        });
        return response;
      } catch (error) {
        this.update(id, () => {
          attempt.durationMs = performance.now() - started;
          attempt.error =
            error instanceof Error ? error.name : "TransportError";
        });
        throw error;
      }
    };
  }

  // Preserve the SDK's original APIPromise (including map/withResponse/asResponse)
  // and method receiver. The inspector reads a clone, never the caller's body.
  instrument<T extends TypeSafeClient>(
    client: T,
    meta:
      | { session: string; label: string; source: "sample" | "live" }
      | (() => { session: string; label: string; source: "sample" | "live" }),
  ): T {
    return new Proxy(client, {
      get: (target, property) => {
        if (property !== "systemOne") {
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (
          request: SystemOneRequest<Questions>,
          options?: RequestOptions,
        ) => {
          const id = randomUUID(),
            started = performance.now(),
            warnings = new Set<string>();
          let captured: Trace["request"];
          try {
            captured = capture(
              { ...request, model: request.model ?? client.defaultModel },
              warnings,
              this.options.redact,
            ) as Trace["request"];
          } catch {
            captured = {
              model: client.defaultModel,
              state: "[capture unavailable]",
              questions: {},
            };
            warnings.add("Input snapshot failed; request continues normally.");
          }
          this.traces.set(id, {
            version: 1,
            id,
            ...(typeof meta === "function" ? meta() : meta),
            flow: this.flowContext.getStore()?.link,
            startedAt: Date.now(),
            status: "pending",
            request: captured,
            attempts: [],
            captureWarnings: [...warnings],
          });
          const trace = this.traces.get(id)!;
          try {
            this.flowContext.getStore()?.onTrace(id);
          } catch {
            /* Observer only. */
          }
          this.revisions.set(trace, ++this.revision);
          const sessions = new Set([trace.session]);
          while (this.traces.size > this.limit) {
            const oldest = this.traces.values().next().value!;
            sessions.add(oldest.session);
            this.traces.delete(oldest.id);
          }
          this.notify(sessions);
          const fail = (error: unknown) =>
            this.update(id, (t) => {
              const e = error as {
                name?: string;
                message?: string;
                status?: number;
                requestId?: string;
              };
              t.status = e.name === "APIUserAbortError" ? "cancelled" : "error";
              t.durationMs = performance.now() - started;
              t.error = {
                name: e.name || "Error",
                message: safeMessage(e.message || "Request failed"),
                status: e.status,
              };
              t.requestId = e.requestId;
            });
          try {
            const promise = this.context.run(id, () =>
              target.systemOne(request, options),
            );
            void promise
              .asResponse()
              .then(async (response) => {
                let result: Trace["result"];
                try {
                  const data = await response.clone().json();
                  result = capture(
                    data,
                    warnings,
                    this.options.redact,
                  ) as Trace["result"];
                } catch {
                  // Capture failures are not SDK failures, and redactor errors
                  // may contain the sensitive values they were meant to hide.
                  warnings.add("Response snapshot failed; result unavailable.");
                }
                this.update(id, (t) => {
                  t.status = "success";
                  t.durationMs = performance.now() - started;
                  t.requestId =
                    response.headers.get("x-typesafe-request-id") ?? undefined;
                  t.result = result;
                  t.captureWarnings = [...warnings];
                });
              }, fail)
              .catch(() => {
                /* Recording errors must not affect inference or expose data. */
              });
            return promise;
          } catch (error) {
            fail(error);
            throw error;
          }
        };
      },
    });
  }
}
