import type { AnswerView, Json, QuestionView, Trace } from "./protocol.js";

const object = (value: Json | undefined): value is { [key: string]: Json } =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: Json | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function question(value: Json): value is QuestionView {
  return object(value) && typeof value.type === "string";
}
function answer(value: Json): value is AnswerView {
  if (!object(value) || typeof value.type !== "string") return false;
  if (value.choice !== undefined && typeof value.choice !== "string")
    return false;
  for (const key of ["score", "noul", "confidence"])
    if (value[key] !== undefined && !finite(value[key])) return false;
  if (
    value.probabilities !== undefined &&
    (!object(value.probabilities) ||
      !Object.values(value.probabilities).every(finite))
  )
    return false;
  if (value.legend !== undefined && !object(value.legend)) return false;
  const box = value.box;
  if (
    box !== undefined &&
    (!object(box) ||
      !["left", "top", "right", "bottom"].every((key) => finite(box[key])) ||
      !Object.values(box).every(finite))
  )
    return false;
  return true;
}
function request(value: Json): value is Trace["request"] {
  return (
    object(value) &&
    typeof value.model === "string" &&
    value.state !== undefined &&
    object(value.questions) &&
    Object.values(value.questions).every(question)
  );
}
function result(value: Json): value is NonNullable<Trace["result"]> {
  return (
    object(value) &&
    typeof value.model === "string" &&
    object(value.answers) &&
    Object.values(value.answers).every(answer) &&
    (value.usage === undefined ||
      (object(value.usage) &&
        finite(value.usage.input_tokens) &&
        finite(value.usage.output_tokens)))
  );
}

type CapturedTrace = Omit<Trace, "request" | "result"> & {
  request: Json;
  result?: Json;
};
function hasStructuredCapture(trace: CapturedTrace): trace is Trace {
  return (
    request(trace.request) &&
    (trace.result === undefined || result(trace.result))
  );
}

/** Project captured JSON, never the original SDK data. Also accepts legacy
 * captures whose content did not satisfy the old asserted declarations.
 * The transport parser remains responsible for the structural Trace envelope. */
export function projectTraceCapture(trace: CapturedTrace): Trace {
  if (hasStructuredCapture(trace)) return trace;
  const requestView = request(trace.request) ? trace.request : undefined;
  const resultView =
    trace.result !== undefined && result(trace.result)
      ? trace.result
      : undefined;
  const capture = { ...trace.capture };
  const warnings = new Set(trace.captureWarnings);
  if (!requestView) {
    capture.request = trace.request;
    warnings.add(
      "Request structured view unavailable; see redacted capture in Raw.",
    );
  }
  if (trace.result !== undefined && !resultView) {
    capture.result = trace.result;
    warnings.add(
      "Response structured view unavailable; see redacted capture in Raw.",
    );
  }
  return {
    ...trace,
    request: requestView ?? { model: "", state: null, questions: {} },
    result: resultView,
    ...(Object.keys(capture).length ? { capture } : {}),
    captureWarnings: [...warnings],
  };
}

// Browser snapshots are immutable. Share the projection across request, flow,
// search and fixture consumers without rechecking content on every render.
const views = new WeakMap<Trace, Trace>();
export function traceCaptureView(trace: Trace): Trace {
  const cached = views.get(trace);
  if (cached) return cached;
  const view = projectTraceCapture(trace);
  views.set(trace, view);
  views.set(view, view);
  return view;
}
