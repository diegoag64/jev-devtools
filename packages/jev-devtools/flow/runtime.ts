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

/** Observer-only copy: preserve aliases inside the snapshot, never to execution data. */
export function observerSnapshot(value: unknown): Json {
  type Copy = { value: Json; height: number };
  const copies = new WeakMap<object, Copy>();
  const ancestors = new Set<object>();
  const visit = (input: unknown, depth: number): Json => {
    if (depth > 40) throw new TypeError("Observer data nesting exceeds 40");
    if (input === null || typeof input !== "object") return jsonSnapshot(input);
    const previous = copies.get(input);
    if (previous) {
      // A shared subtree reached through a deeper path still obeys the depth limit.
      if (depth + previous.height > 40)
        throw new TypeError("Observer data nesting exceeds 40");
      return previous.value;
    }
    if (
      (!Array.isArray(input) &&
        Object.getPrototypeOf(input) !== Object.prototype &&
        Object.getPrototypeOf(input) !== null) ||
      Object.getOwnPropertySymbols(input).length
    )
      throw new TypeError("Observer data must be JSON-compatible");
    if (ancestors.has(input))
      throw new TypeError("Observer data cannot contain cycles");
    ancestors.add(input);
    try {
      let height = 0;
      const child = (value: unknown): Json => {
        const copy = visit(value, depth + 1);
        const childHeight =
          value && typeof value === "object" ? copies.get(value)!.height : 0;
        height = Math.max(height, childHeight + 1);
        return copy;
      };
      const value = Array.isArray(input)
        ? Array.from(input, child)
        : Object.fromEntries(
            Object.entries(input).map(([key, value]) => [key, child(value)]),
          );
      const copy = { value, height };
      copies.set(input, copy);
      return value;
    } finally {
      ancestors.delete(input);
    }
  };
  return visit(value, 0);
}

/** Recording may establish synchronous context, but cannot replace or repeat execution. */
export function observeRequest<T>(
  callback: () => T,
  observe?: (call: () => T) => unknown,
): T {
  let called = false;
  let result: T;
  let failure: { error: unknown } | undefined;
  const callOnce = (): T => {
    if (!called) {
      called = true;
      try {
        result = callback();
      } catch (error) {
        failure = { error };
      }
    }
    if (failure) throw failure.error;
    return result;
  };
  try {
    // Observe rejected hook promises without awaiting them or changing the SDK result.
    if (observe) void Promise.resolve(observe(callOnce)).catch(() => {});
  } catch {
    // A hook can fail before or after calling through. Reuse that invocation below.
  }
  return callOnce();
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
