import type { Trace } from "./protocol.js";

import { projectTraceCapture } from "./capture-view.js";
import { parseTraceRecord } from "./trace-parser.js";
import { ids, integer, parse, record } from "./transport-validation.js";

function traces(value: unknown): Trace[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new Error("Invalid traces");
  const ids = new Set<string>();
  return value.map((input: unknown) => {
    const trace = projectTraceCapture(parseTraceRecord(input));
    if (ids.has(trace.id)) throw new Error("Duplicate trace ID");
    ids.add(trace.id);
    return trace;
  });
}

// Owned by one EventSource connection. Unchanged trace objects keep their
// identity; validate the complete update before replacing any current state.
export class TraceStore {
  private current: Trace[] = [];
  private revision: number | undefined;
  apply(event: "snapshot" | "delta", input: unknown): Trace[] {
    const data = parse(record, input, "update");
    if (event === "snapshot") {
      if (data.version !== 1 && data.version !== 2)
        throw new Error("Unsupported stream");
      const nextRevision =
        data.version === 2
          ? parse(integer, data.revision, "revision")
          : undefined;
      const next = traces(data.traces);
      this.current = next;
      this.revision = nextRevision;
      return next;
    }
    if (
      data.version !== 2 ||
      this.revision === undefined ||
      data.base !== this.revision ||
      !integer(data.revision) ||
      data.revision <= this.revision
    )
      throw new Error("Inspector stream needs a fresh snapshot");
    const order = parse(ids, data.order, "retained order");
    const retained = new Set(order);
    const upserts = traces(data.upserts);
    if (upserts.some((t) => !retained.has(t.id)))
      throw new Error("Unexpected upsert");
    const byId = new Map(this.current.map((t) => [t.id, t]));
    for (const trace of upserts) byId.set(trace.id, trace);
    const next = order.map((id) => {
      const trace = byId.get(id);
      if (!trace) throw new Error("Missing retained trace");
      return trace;
    });
    this.current = next;
    this.revision = data.revision;
    return next;
  }
}
