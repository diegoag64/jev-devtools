import { FlowRecorder } from "./flows.js";
import type { FlowObserver } from "../flow/index.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { JevRecorder, type CaptureOptions } from "./recorder.js";
export { JevRecorder } from "./recorder.js";
export type { CaptureOptions } from "./recorder.js";
export type JevDevtoolsServerOptions = CaptureOptions & {
  /** Explicit opt-in; disabled by default. */
  enabled?: boolean;
  origin: string;
  endpoint?: string;
  /**
   * Required for non-loopback origins. Without it, Node middleware only accepts
   * loopback connections. Apply your application's authentication.
   */
  authorize?: (request: Request) => boolean | Promise<boolean>;
  /** Server-derived scope. Defaults to a shared local-development history. */
  getSession?: (request: Request) => string | Promise<string>;
};
export type ClientMetadata = { label?: string; source?: "sample" | "live" };
// Host and Origin are client-controlled, so locality is decided by the socket peer.
const isLoopback = (address = "") =>
  address === "::1" || /^(::ffff:)?127\./.test(address);
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

/** Node runtime adapter: framework-neutral Request/Response plus Node middleware. */
export function createJevDevtools(options: JevDevtoolsServerOptions) {
  const origin = new URL(options.origin).origin;
  const endpoint = (options.endpoint ?? "/api/jev-devtools").replace(/\/$/, "");
  if (
    !endpoint.startsWith("/") ||
    endpoint.startsWith("//") ||
    /[?#]/.test(endpoint)
  )
    throw new Error(
      "endpoint must be an absolute path without a query or fragment",
    );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(origin).hostname,
  );
  if (options.enabled && !local && !options.authorize)
    throw new Error("Non-loopback inspector endpoints require authorize");
  const recorder = new JevRecorder(options),
    scope = new AsyncLocalStorage<string>();
  const flows = new FlowRecorder(options);
  const streams = new Set<() => void>();
  type Encoded = { bytes: Uint8Array; revision: number };
  type UpdateFor = (
    session: string,
    incremental: boolean,
    cursor?: number,
  ) => Encoded;
  type Flush = (updateFor: UpdateFor) => void;
  const pending = new Set<Flush>();
  const encoder = new TextEncoder();
  let scheduled: ReturnType<typeof setImmediate> | undefined;
  const encodeUpdate: UpdateFor = (session, incremental, cursor) => {
    if (!incremental)
      return {
        bytes: encoder.encode(
          `event: snapshot\ndata: ${JSON.stringify({ version: 1, traces: recorder.snapshot(session) })}\n\n`,
        ),
        revision: 0,
      };
    const { revision, upserts, order } = recorder.changes(session, cursor);
    const initial = cursor === undefined;
    const data = initial
      ? { version: 2, revision, traces: upserts }
      : { version: 2, base: cursor, revision, upserts, order };
    return {
      bytes: encoder.encode(
        `event: ${initial ? "snapshot" : "delta"}\ndata: ${JSON.stringify(data)}\n\n`,
      ),
      revision,
    };
  };
  function schedule(flush: Flush) {
    pending.add(flush);
    if (scheduled) return;
    scheduled = setImmediate(() => {
      scheduled = undefined;
      const batch = [...pending];
      pending.clear();
      // Cache only for this synchronous delivery turn and only within a session.
      // Each reader owns its bytes; mutating one Response must not corrupt another.
      const encoded = new Map<string, Encoded>();
      const updateFor: UpdateFor = (session, incremental, cursor) => {
        // Slow readers can have older cursors even in the same session.
        const key = JSON.stringify([session, incremental, cursor]);
        let update = encoded.get(key);
        if (!update) {
          update = encodeUpdate(session, incremental, cursor);
          encoded.set(key, update);
        }
        return { bytes: update.bytes.slice(), revision: update.revision };
      };
      for (const deliver of batch) deliver(updateFor);
    });
  }
  function unschedule(flush: Flush) {
    pending.delete(flush);
    if (!pending.size && scheduled) {
      clearImmediate(scheduled);
      scheduled = undefined;
    }
  }
  let disposed = false;
  const enabled = () => options.enabled === true && !disposed;
  const sessionFor = async (request: Request) => {
    const session = (await options.getSession?.(request)) ?? "local";
    if (typeof session !== "string" || !session || session.length > 200)
      throw new Error("Invalid inspector scope");
    return session;
  };
  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (
      !enabled() ||
      !(url.pathname === endpoint || url.pathname.startsWith(endpoint + "/"))
    )
      return json({ error: "Not found" }, 404);
    if (
      url.origin !== origin ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !== origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return json({ error: "Same-origin requests required" }, 403);
    if (options.authorize && !(await options.authorize(request)))
      return json({ error: "Unauthorized" }, 403);
    const session = await sessionFor(request);
    if (url.pathname === endpoint && request.method === "GET")
      return json({ version: 1, enabled: true, flows: true });
    if (url.pathname === endpoint + "/clear") {
      if (request.method !== "DELETE")
        return json({ error: "Method not allowed" }, 405);
      if (request.headers.get("origin") !== origin)
        return json({ error: "Same-origin requests required" }, 403);
      recorder.clear(session);
      flows.clear(session);
      return json({ ok: true });
    }
    let flowPull = () => {};
    if (url.pathname === endpoint + "/flows/events") {
      if (request.method !== "GET")
        return json({ error: "Method not allowed" }, 405);
      let stop = () => {};
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false,
            dirty = true,
            cursor: number | undefined,
            timer: ReturnType<typeof setImmediate> | undefined;
          let knownDefinitions = new Set<string>();
          const flush = () => {
            timer = undefined;
            if (closed || !dirty || (controller.desiredSize ?? 0) <= 0) return;
            try {
              const update = flows.changes(session, cursor, knownDefinitions);
              controller.enqueue(
                encoder.encode(
                  `event: flows\ndata: ${JSON.stringify(update.data)}\n\n`,
                ),
              );
              // Match the browser's pruning after this delivered order. A clear
              // coalesced away under backpressure must not discard reader state.
              knownDefinitions = update.retainedDefinitionIds;
              cursor = update.revision;
              dirty = false;
            } catch {
              // A failed delivery must not advance the cursor or escape into
              // application execution; reconnect starts with a full snapshot.
              stop();
            }
          };
          const wake = () => {
            if (!closed && dirty && !timer) timer = setImmediate(flush);
          };
          const unsubscribe = flows.subscribe((sessions) => {
            if (sessions.has(session)) {
              dirty = true;
              wake();
            }
          });
          const heartbeat = setInterval(() => {
            if (!closed && (controller.desiredSize ?? 0) > 0)
              controller.enqueue(encoder.encode(": keepalive\n\n"));
          }, 15000);
          stop = () => {
            if (closed) return;
            closed = true;
            knownDefinitions.clear();
            unsubscribe();
            clearImmediate(timer);
            clearInterval(heartbeat);
            request.signal.removeEventListener("abort", stop);
            streams.delete(stop);
            try {
              controller.close();
            } catch {}
          };
          streams.add(stop);
          request.signal.addEventListener("abort", stop, { once: true });
          flowPull = wake;
          if (request.signal.aborted) stop();
          else flush();
        },
        pull() {
          flowPull();
        },
        cancel() {
          stop();
        },
      });
      return new Response(body, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          "x-accel-buffering": "no",
        },
      });
    }
    if (url.pathname !== endpoint + "/events")
      return json({ error: "Not found" }, 404);
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    const incremental = url.searchParams.get("protocol") === "2";
    let cursor: number | undefined;
    let cleanup = () => {},
      wake = () => {},
      flush: Flush = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false,
          dirty = true;
        flush = (updateFor) => {
          if (closed || !dirty || (controller.desiredSize ?? 0) <= 0) return;
          dirty = false;
          try {
            const update = updateFor(session, incremental, cursor);
            controller.enqueue(update.bytes);
            cursor = update.revision;
          } catch {
            // Deferred observer failures must not escape into the application's
            // event loop or prevent other viewers from receiving their update.
            cleanup();
          }
        };
        wake = () => {
          if (!closed && dirty && (controller.desiredSize ?? 0) > 0)
            schedule(flush);
        };
        const unsubscribe = recorder.subscribe((sessions) => {
          if (!sessions.has(session)) return;
          dirty = true;
          wake();
        });
        const heartbeat = setInterval(() => {
          if (!closed && (controller.desiredSize ?? 0) > 0)
            controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15_000);
        cleanup = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          unschedule(flush);
          clearInterval(heartbeat);
          request.signal.removeEventListener("abort", cleanup);
          streams.delete(cleanup);
          try {
            controller.close();
          } catch {
            /* Already cancelled by the consumer. */
          }
        };
        streams.add(cleanup);
        request.signal.addEventListener("abort", cleanup, { once: true });
        if (request.signal.aborted) cleanup();
        else flush(encodeUpdate);
      },
      pull() {
        // Reading must not bypass the batching boundary. A full queue retains
        // only a dirty flag; the next readable turn delivers current history.
        wake();
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  }
  async function middleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    const path = (req.url ?? "").split("?")[0];
    if (path !== endpoint && !path.startsWith(endpoint + "/")) {
      next();
      return;
    }
    if (
      enabled() &&
      !options.authorize &&
      !isLoopback(req.socket.remoteAddress)
    ) {
      res
        .writeHead(403, {
          "content-type": "application/json",
          "cache-control": "no-store",
        })
        .end('{"error":"Loopback connections required without authorize"}');
      return;
    }
    const abort = new AbortController();
    res.once("close", () => abort.abort());
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(",") : value);
      const request = new Request(
        new URL(req.url!, `${new URL(origin).protocol}//${req.headers.host}`),
        { method: req.method, headers, signal: abort.signal },
      );
      const response = await handle(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        await pipeline(
          Readable.fromWeb(
            response.body as Parameters<typeof Readable.fromWeb>[0],
          ),
          res,
        );
      else res.end();
    } catch {
      if (!res.headersSent && !res.destroyed)
        res
          .writeHead(500, { "content-type": "application/json" })
          .end('{"error":"Inspector unavailable"}');
      else res.destroy();
    }
  }
  const startFlow: FlowObserver["startFlow"] = (definition, run) => {
    if (!enabled()) return;
    flows.start(definition, run, scope.getStore() ?? "local");
    return {
      update: (next) => {
        if (enabled()) flows.update(next);
      },
      request: (link, onTrace, callback) =>
        recorder.withFlow(link, onTrace, callback),
    };
  };
  return {
    startFlow,
    handle,
    /**
     * For Node framework routes whose Request URL uses an internal hostname.
     * Require the actual Host header to match the configured public authority;
     * never trust forwarded host/protocol headers. Origin checks still apply.
     * A Request does not expose the socket peer and any non-browser client can
     * set Host, so bind the server to loopback or set authorize.
     */
    handleNodeRoute(request: Request): Promise<Response> {
      if (!enabled()) return handle(request);
      if (request.headers.get("host") !== new URL(origin).host)
        return Promise.resolve(
          json({ error: "Same-origin requests required" }, 403),
        );
      const url = new URL(request.url);
      return handle(new Request(origin + url.pathname + url.search, request));
    },
    middleware,
    createClient(
      clientOptions: ConstructorParameters<typeof TypeSafeClient>[0],
      meta: ClientMetadata = {},
    ) {
      // A disabled adapter is a normal SDK client: no recording or fetch wrapper.
      if (!enabled()) return new TypeSafeClient(clientOptions);
      const client = new TypeSafeClient({
        ...clientOptions,
        fetch: recorder.transport(clientOptions?.fetch ?? globalThis.fetch),
      });
      return recorder.instrument(client, () => ({
        session: scope.getStore() ?? "local",
        label: meta.label ?? "Jev request",
        source: meta.source ?? "live",
      }));
    },
    /** Needed only when getSession is customized. Wrap the application's request handler. */
    async run<T>(request: Request, callback: () => T | Promise<T>): Promise<T> {
      return scope.run(await sessionFor(request), callback);
    },
    dispose() {
      disposed = true;
      for (const close of [...streams]) close();
    },
  };
}

const sharedAdaptersKey = Symbol.for("jev-devtools/adapters/v1");
type Adapter = ReturnType<typeof createJevDevtools>;

/**
 * Reuse one adapter across server module reloads in the same Node realm.
 * Use a stable app-specific key. The first options factory wins until dispose
 * or process restart; restart after editing configuration/auth/redaction callbacks.
 * This does not share history between workers or serverless instances.
 */
export function getJevDevtools(
  key: string,
  createOptions: () => JevDevtoolsServerOptions,
): Adapter {
  if (!key.trim()) throw new Error("A non-empty application key is required");
  const shared = globalThis as typeof globalThis & {
    [sharedAdaptersKey]?: Map<string, Adapter>;
  };
  const adapters = (shared[sharedAdaptersKey] ??= new Map());
  const existing = adapters.get(key);
  if (existing) return existing;
  const adapter = createJevDevtools(createOptions());
  const dispose = adapter.dispose;
  adapter.dispose = () => {
    dispose();
    if (adapters.get(key) === adapter) adapters.delete(key);
  };
  adapters.set(key, adapter);
  return adapter;
}
