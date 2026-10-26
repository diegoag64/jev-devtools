import type { AnswerView, Json, QuestionView, Trace } from "./protocol.js";

const isJsonObject = (
  value: Json | undefined,
): value is { [key: string]: Json } =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: Json | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isQuestionView(value: Json): value is QuestionView {
  return isJsonObject(value) && typeof value.type === "string";
}
function isAnswerView(value: Json): value is AnswerView {
  if (!isJsonObject(value) || typeof value.type !== "string") return false;
  if (value.choice !== undefined && typeof value.choice !== "string")
    return false;
  for (const key of ["score", "noul", "confidence"])
    if (value[key] !== undefined && !isFiniteNumber(value[key])) return false;
  if (
    value.probabilities !== undefined &&
    (!isJsonObject(value.probabilities) ||
      !Object.values(value.probabilities).every(isFiniteNumber))
  )
    return false;
  if (value.legend !== undefined && !isJsonObject(value.legend)) return false;
  const box = value.box;
  if (
    box !== undefined &&
    (!isJsonObject(box) ||
      !["left", "top", "right", "bottom"].every((key) =>
        isFiniteNumber(box[key]),
      ) ||
      !Object.values(box).every(isFiniteNumber))
  )
    return false;
  return true;
}
function isRequestView(value: Json): value is Trace["request"] {
  return (
    isJsonObject(value) &&
    typeof value.model === "string" &&
    value.state !== undefined &&
    isJsonObject(value.questions) &&
    Object.values(value.questions).every(isQuestionView)
  );
}
function isResultView(value: Json): value is NonNullable<Trace["result"]> {
  return (
    isJsonObject(value) &&
    typeof value.model === "string" &&
    isJsonObject(value.answers) &&
    Object.values(value.answers).every(isAnswerView) &&
    (value.usage === undefined ||
      (isJsonObject(value.usage) &&
        isFiniteNumber(value.usage.input_tokens) &&
        isFiniteNumber(value.usage.output_tokens)))
  );
}

type CapturedTrace = Omit<Trace, "request" | "result"> & {
  request: Json;
  result?: Json;
};
function hasStructuredCapture(trace: CapturedTrace): trace is Trace {
  return (
    isRequestView(trace.request) &&
    (trace.result === undefined || isResultView(trace.result))
  );
}

/** Project captured JSON, never the original SDK data. Also accepts legacy
 * captures whose content did not satisfy the old asserted declarations.
 * The transport parser remains responsible for the structural Trace envelope. */
export function projectTraceCapture(trace: CapturedTrace): Trace {
  if (hasStructuredCapture(trace)) return trace;
  const requestView = isRequestView(trace.request) ? trace.request : undefined;
  const resultView =
    trace.result !== undefined && isResultView(trace.result)
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
