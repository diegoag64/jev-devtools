import type { Json } from "../src/protocol.js";

/** Detached JSON snapshot, without capture truncation or lossy JSON.stringify. */
export function jsonSnapshot(
  value: unknown,
  seen = new Set<object>(),
  depth = 0,
): Json {
  if (depth > 40) throw new TypeError("Task data nesting exceeds 40");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    !value ||
    typeof value !== "object" ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError("Task inputs and outputs must be JSON-compatible");
  if (seen.has(value)) throw new TypeError("Task data cannot contain cycles");
  if (Object.getOwnPropertySymbols(value).length)
    throw new TypeError("Task data cannot contain symbol keys");
  seen.add(value);
  try {
    if (Array.isArray(value))
      return Array.from(value, (v) => jsonSnapshot(v, seen, depth + 1));
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        jsonSnapshot(v, seen, depth + 1),
      ]),
    );
  } finally {
    seen.delete(value);
  }
}

/** Cancellation ends awaiting, even when user code ignores the cooperative signal. */
export function runCallback(
  callback: (signal: AbortSignal) => unknown,
  parent: AbortSignal,
  timeoutMs?: number,
): Promise<unknown> {
  const controller = new AbortController();
  const started = performance.now();
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", cancel);
    };
    const finish = (error: unknown, value?: unknown, failed = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (failed) reject(error);
      else resolve(value);
    };
    const stop = (error: Error) => {
      controller.abort(error);
      finish(error, undefined, true);
    };
    const cancel = () => stop(new DOMException("Flow cancelled", "AbortError"));
    if (parent.aborted) {
      cancel();
      return;
    }
    parent.addEventListener("abort", cancel, { once: true });
    if (timeoutMs !== undefined)
      timer = setTimeout(
        () => stop(new DOMException("Task timed out", "TimeoutError")),
        timeoutMs,
      );
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return callback(controller.signal);
      })
      .then(
        (value) => {
          // CPU-bound callbacks cannot be interrupted, but their late result must
          // still not advance the flow after the configured deadline.
          if (
            timeoutMs !== undefined &&
            performance.now() - started >= timeoutMs
          )
            stop(new DOMException("Task timed out", "TimeoutError"));
          else finish(undefined, value);
        },
        (error) => finish(error, undefined, true),
      );
  });
}
