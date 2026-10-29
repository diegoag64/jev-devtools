import type { Json, Trace } from "./protocol.js";
import {
  array,
  finite,
  id,
  integer,
  json,
  literal,
  nonnegative,
  optional,
  parse,
  shape,
  status,
  strings,
  text,
} from "./transport-validation.js";

// Content can be replaced by redaction, including at the root. The capture-view
// projection owns conversion to structured request/result views after parsing.
type WireTrace = Omit<Trace, "request" | "result"> & {
  request: Json;
  result?: Json;
};
const trace = shape<WireTrace>({
  version: literal(1),
  id,
  session: text,
  label: text,
  source: literal("sample", "live"),
  status,
  startedAt: finite,
  durationMs: optional(nonnegative),
  request: json,
  result: optional(json),
  capture: optional(shape({ request: optional(json), result: optional(json) })),
  captureFidelity: optional(
    shape({
      request: optional(literal("exact", "modified", "unknown")),
      result: optional(literal("exact", "modified", "unknown")),
    }),
  ),
  flow: optional(shape({ runId: id, stepId: id, executionId: id })),
  requestId: optional(text),
  error: optional(
    shape({ name: text, message: text, status: optional(finite) }),
  ),
  attempts: array(
    shape({
      number: integer,
      durationMs: optional(nonnegative),
      status: optional(finite),
      error: optional(text),
    }),
  ),
  captureWarnings: strings,
});
export function parseTraceRecord(input: unknown): WireTrace {
  return parse(trace, input, "trace record");
}
