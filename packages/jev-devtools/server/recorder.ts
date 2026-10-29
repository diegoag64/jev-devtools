import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { types } from "node:util";
import { Image, TypeSafeClient } from "@typesafe-ai/sdk";
import {
  detachForRedaction,
  captureLimits,
  captureEntryLimit,
} from "./capture-copy.js";
import type {
  Fetch,
  Questions,
  SystemOneRequest,
  RequestOptions,
} from "@typesafe-ai/sdk";
import { projectTraceCapture } from "../src/capture-view.js";
import type { CaptureFidelity, Json, Trace } from "../src/protocol.js";
import {
  hasOmittedSdkFields,
  snapshotIsUncertain,
} from "./capture-provenance.js";

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
/** The capture boundary, independent of field names and runtime values. */
export type CaptureContext = {
  readonly kind:
    | "request"
    | "response"
    | "step-data"
    | "condition-rule"
    | "outcome";
};

export type CaptureOptions = {
  limit?: number;
  /** Existing paths are unchanged; context distinguishes otherwise identical paths. */
  redact?: (path: string[], value: unknown, context: CaptureContext) => unknown;
};

// Snapshot before the caller can mutate its request. Bounded and cycle-safe;
// image handles become explicit previews/references instead of opaque SDK objects.
export function capture(
  value: unknown,
  warnings: Set<string>,
  redact?: CaptureOptions["redact"],
  context: CaptureContext = { kind: "request" },
): Json {
  return captureWithFidelity(value, warnings, redact, context).value;
}

/** Internal capture result. Fidelity covers this traversal, not an upstream snapshot. */
export function captureWithFidelity(
  value: unknown,
  warnings: Set<string>,
  redact?: CaptureOptions["redact"],
  context: CaptureContext = { kind: "request" },
): { value: Json; fidelity: CaptureFidelity } {
  let modified = false;
  let uncertain = !!redact;
  const detachedContext = Object.freeze({ kind: context.kind });
  const detached = redact ? detachForRedaction(value, warnings) : undefined;
  const seen = new WeakSet<object>();
  let budget: number = captureLimits.budget;
  const visit = (input: unknown, path: string[], depth: number): Json => {
    const key = (path.at(-1) ?? "").replace(/[-_]/g, "").toLowerCase();
    if (credentialKeys.has(key)) {
      warnings.add("Capture contains redacted values.");
      return "[redacted]";
    }
    // A cutoff is control metadata, never a fabricated callback value.
    if (detached?.projection(input)?.omitted) return "[truncated]";
    if (redact) {
      const redacted = redact([...path], input, detachedContext);
      detached?.assertPolicyAccess();
      if (!Object.is(redacted, input))
        warnings.add("Capture contains redacted values.");
      input = redacted;
    }
    const projection = detached?.projection(input);
    if (projection?.omitted) return "[truncated]";
    if (projection) input = projection.value;
    budget -= 8 + (path.at(-1)?.length ?? 0);
    if (budget <= 0 || depth > captureLimits.depth) {
      warnings.add("Capture size/depth limit reached.");
      return "[truncated]";
    }
    if (input === undefined) {
      modified = true;
      return null;
    }
    if (input === null) return null;
    if (typeof input === "string") {
      const text = input.slice(0, Math.min(budget, captureLimits.text));
      budget -= text.length;
      if (text.length < input.length)
        warnings.add("Long text truncated in capture.");
      return text;
    }
    if (typeof input === "boolean") return input;
    if (typeof input === "number") {
      if (Number.isFinite(input)) {
        // JSON transport normalizes -0 even though execution retains its sign.
        if (Object.is(input, -0)) modified = true;
        return input;
      }
      modified = true;
      return String(input);
    }
    if (typeof input !== "object") {
      modified = true;
      return String(input);
    }
    if (seen.has(input)) {
      modified = true;
      return "[circular/repeated reference]";
    }
    seen.add(input);
    if (input instanceof Image) {
      modified = true;
      const omitted = projection?.image?.();
      if (omitted) return { kind: "image", ...omitted };
      const bytes = input.data,
        result: { [key: string]: Json } = {
          kind: "image",
          ref: String(input),
          bytes: bytes instanceof Blob ? bytes.size : bytes.byteLength,
        };
      if (
        bytes instanceof Uint8Array &&
        bytes.byteLength < captureLimits.imageBytes &&
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
    // SDK serialization can read nonenumerable or inherited toJSON hooks.
    // Check presence without reading the property or invoking the hook again.
    if (types.isProxy(input) || "toJSON" in input) uncertain = true;
    if (Array.isArray(input)) {
      // Inspect only retained indices, without enumerating a potentially huge array.
      // Extra array properties are not part of its JSON value.
      const length = Math.min(input.length, captureLimits.entries);
      const output = new Array<Json>(length);
      for (let index = 0; index < length; index++) {
        const field = Object.getOwnPropertyDescriptor(input, String(index));
        if (!field) modified = true;
        else if (field.get || field.set) uncertain = true;
        // Do not invoke user slice/map overrides or array species constructors.
        // Preserve holes; JSON will normalize them to null with modified fidelity.
        if (index in input)
          output[index] = visit(
            input[index],
            [...path, String(index)],
            depth + 1,
          );
      }
      if (input.length > captureLimits.entries)
        warnings.add("Long collection truncated in capture.");
      return output;
    }
    if (
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    )
      modified = true;
    if (Object.getOwnPropertySymbols(input).length) modified = true;
    // SDK question validation can read fields omitted by JSON enumeration.
    if (
      !uncertain &&
      context.kind === "request" &&
      path.length === 2 &&
      path[0] === "questions" &&
      hasOmittedSdkFields(input, ["type", "criteria", "instructions"])
    )
      uncertain = true;
    const entries: [string, Json][] = [];
    for (const key in input) {
      if (!Object.hasOwn(input, key)) continue;
      if (entries.length >= captureEntryLimit(path.at(-1))) {
        warnings.add("Long collection truncated in capture.");
        break;
      }
      if (!uncertain && !modified) {
        const field = Object.getOwnPropertyDescriptor(input, key);
        if (!field || field.get || field.set) uncertain = true;
      }
      entries.push([
        key,
        visit(Reflect.get(input, key), [...path, key], depth + 1),
      ]);
    }
    return Object.fromEntries(entries);
  };
  const captured = visit(detached ? detached.value : value, [], 0);
  return {
    value: captured,
    fidelity:
      modified || warnings.size ? "modified" : uncertain ? "unknown" : "exact",
  };
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
          let captured: Json;
          let requestFidelity: CaptureFidelity = "modified";
          try {
            // Getters can replace their own descriptors when the snapshot reads
            // them. Preserve provenance before spreading or reading properties.
            const uncertainRequest =
              snapshotIsUncertain(request) ||
              hasOmittedSdkFields(request, [
                "state",
                "questions",
                "model",
                "assets",
              ]);
            const result = captureWithFidelity(
              { ...request, model: request.model ?? client.defaultModel },
              warnings,
              this.options.redact,
              { kind: "request" },
            );
            captured = result.value;
            requestFidelity = result.fidelity;
            if (requestFidelity === "exact" && uncertainRequest)
              requestFidelity = "unknown";
          } catch {
            captured = null;
            warnings.add("Input snapshot failed; request continues normally.");
          }
          this.traces.set(
            id,
            projectTraceCapture({
              version: 1,
              id,
              ...(typeof meta === "function" ? meta() : meta),
              flow: this.flowContext.getStore()?.link,
              startedAt: Date.now(),
              status: "pending",
              request: captured,
              captureFidelity: { request: requestFidelity },
              attempts: [],
              captureWarnings: [...warnings],
            }),
          );
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
                let result: Json | undefined;
                let resultFidelity: CaptureFidelity = "modified";
                const resultWarnings = new Set<string>();
                try {
                  const data = await response.clone().json();
                  const captured = captureWithFidelity(
                    data,
                    resultWarnings,
                    this.options.redact,
                    { kind: "response" },
                  );
                  result = captured.value;
                  resultFidelity = captured.fidelity;
                } catch {
                  // Capture failures are not SDK failures, and redactor errors
                  // may contain the sensitive values they were meant to hide.
                  resultWarnings.add(
                    "Response snapshot failed; result unavailable.",
                  );
                }
                this.update(id, (t) => {
                  t.status = "success";
                  t.durationMs = performance.now() - started;
                  t.requestId =
                    response.headers.get("x-typesafe-request-id") ?? undefined;
                  Object.assign(
                    t,
                    projectTraceCapture({
                      ...t,
                      result,
                      captureFidelity: {
                        ...t.captureFidelity,
                        result: resultFidelity,
                      },
                      captureWarnings: [
                        ...new Set([...t.captureWarnings, ...resultWarnings]),
                      ],
                    }),
                  );
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
