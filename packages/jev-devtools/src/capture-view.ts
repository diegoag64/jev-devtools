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
    captureFidelity: {
      ...trace.captureFidelity,
      ...(!requestView ? { request: "modified" as const } : {}),
      ...(trace.result !== undefined && !resultView
        ? { result: "modified" as const }
        : {}),
    },
    ...(Object.keys(capture).length ? { capture } : {}),
    captureWarnings: [...warnings],
  };
}

type Path = readonly string[];
const missing = new WeakMap<Trace, Path[]>();
const startsWith = (path: Path, prefix: Path) =>
  prefix.every((part, index) => path[index] === part);

/** Read only the captured copy, including legacy and whole-value replacements. */
export function capturedValue(trace: Trace, path: Path): Json | undefined {
  const [section, ...parts] = path;
  let value: Json | undefined =
    section === "request"
      ? (trace.capture?.request ?? trace.request)
      : (trace.capture?.result ?? trace.result);
  // Null is an explicit capture, not a missing capture.
  if (section === "request" && trace.capture?.request === null) value = null;
  if (section === "result" && trace.capture?.result === null) value = null;
  for (const key of parts) value = isJsonObject(value) ? value[key] : undefined;
  return value;
}

export function captureQuestionEntries(trace: Trace): [string, QuestionView][] {
  const questions = { ...trace.request.questions };
  if (trace.capture?.request !== undefined)
    for (const name of Object.keys(trace.result?.answers ?? {}))
      if (!Object.hasOwn(questions, name))
        Object.defineProperty(questions, name, {
          value: { type: "Unavailable" },
          enumerable: true,
        });
  return Object.entries(questions);
}

export function captureFieldUnavailable(trace: Trace, path: Path): boolean {
  return (missing.get(traceCaptureView(trace)) ?? []).some((entry) =>
    startsWith(path, entry),
  );
}

export function unavailableCaptureFields(trace: Trace, prefix: Path): Path[] {
  return (missing.get(traceCaptureView(trace)) ?? []).filter((entry) =>
    startsWith(entry, prefix),
  );
}

// The wire view remains conservative for public consumers and replay. The
// browser can display valid siblings because every omitted field has a path.
function partialCaptureView(trace: Trace): Trace {
  const paths: Path[] = [];
  const absent = (path: Path) => {
    paths.push(path);
  };
  const object = (value: Json | undefined, path: Path) => {
    if (isJsonObject(value)) return value;
    absent(path);
    return {};
  };
  const text = (value: Json | undefined, path: Path, fallback = "") => {
    if (typeof value === "string") return value;
    absent(path);
    return fallback;
  };
  const request = capturedValue(trace, ["request"]);
  const result = capturedValue(trace, ["result"]);
  const r = object(request, ["request"]);
  const questions = object(r.questions, ["request", "questions"]);
  const requestView: Trace["request"] = {
    ...r,
    model: text(r.model, ["request", "model"]),
    state: r.state ?? null,
    questions: Object.fromEntries(
      Object.entries(questions).map(([key, value]) => {
        const path = ["request", "questions", key];
        const q = object(value, path);
        return [
          key,
          { ...q, type: text(q.type, [...path, "type"], "Unavailable") },
        ];
      }),
    ),
  };
  if (r.state === undefined) absent(["request", "state"]);
  let resultView: Trace["result"];
  if (result !== undefined) {
    const r = object(result, ["result"]);
    const answers = object(r.answers, ["result", "answers"]);
    resultView = {
      model: text(r.model, ["result", "model"]),
      answers: Object.fromEntries(
        Object.entries(answers).map(([key, value]) => {
          const path = ["result", "answers", key];
          const a = object(value, path);
          const answer: AnswerView = {
            type: text(a.type, [...path, "type"], "Unavailable"),
          };
          if (a.choice !== undefined) {
            if (typeof a.choice === "string") answer.choice = a.choice;
            else absent([...path, "choice"]);
          }
          for (const field of ["score", "noul", "confidence"] as const) {
            if (a[field] === undefined) continue;
            if (isFiniteNumber(a[field])) answer[field] = a[field];
            else absent([...path, field]);
          }
          if (a.probabilities !== undefined) {
            const probabilities = object(a.probabilities, [
              ...path,
              "probabilities",
            ]);
            answer.probabilities = Object.fromEntries(
              Object.entries(probabilities).flatMap(([label, value]) => {
                if (isFiniteNumber(value)) return [[label, value]];
                absent([...path, "probabilities", label]);
                return [];
              }),
            );
          }
          if (a.legend !== undefined) {
            if (isJsonObject(a.legend)) answer.legend = a.legend;
            else absent([...path, "legend"]);
          }
          if (a.box !== undefined) {
            const box = object(a.box, [...path, "box"]);
            for (const field of new Set([
              "left",
              "top",
              "right",
              "bottom",
              ...Object.keys(box),
            ])) {
              if (!isFiniteNumber(box[field])) absent([...path, "box", field]);
            }
            if (
              isFiniteNumber(box.left) &&
              isFiniteNumber(box.top) &&
              isFiniteNumber(box.right) &&
              isFiniteNumber(box.bottom)
            ) {
              answer.box = {
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
              };
            }
          }
          return [key, answer];
        }),
      ),
    };
    if (r.usage !== undefined) {
      const usage = object(r.usage, ["result", "usage"]);
      for (const field of ["input_tokens", "output_tokens"])
        if (!isFiniteNumber(usage[field])) absent(["result", "usage", field]);
      if (
        isFiniteNumber(usage.input_tokens) &&
        isFiniteNumber(usage.output_tokens)
      )
        resultView.usage = {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        };
    }
  }
  if (trace.capture?.request !== undefined)
    for (const key of Object.keys(resultView?.answers ?? {}))
      if (!Object.hasOwn(questions, key)) absent(["request", "questions", key]);
  // Collapse descendant failures when their entire parent is unavailable.
  const pathKeys = new Set(paths.map((path) => JSON.stringify(path)));
  const unavailable = paths.filter(
    (path) =>
      !path.some((_, index) =>
        pathKeys.has(JSON.stringify(path.slice(0, index))),
      ),
  );
  const view = {
    ...trace,
    request: trace.capture?.request === undefined ? trace.request : requestView,
    result: trace.capture?.result === undefined ? trace.result : resultView,
    captureFidelity: {
      ...trace.captureFidelity,
      ...(trace.capture?.request !== undefined
        ? { request: "modified" as const }
        : {}),
      ...(trace.capture?.result !== undefined
        ? { result: "modified" as const }
        : {}),
    },
    captureWarnings: trace.captureWarnings.map((warning) =>
      warning ===
        "Request structured view unavailable; see redacted capture in Raw." ||
      warning ===
        "Response structured view unavailable; see redacted capture in Raw."
        ? "Some captured fields are unavailable. See Raw for captured content."
        : warning,
    ),
  };
  view.captureWarnings = [...new Set(view.captureWarnings)];
  missing.set(view, unavailable);
  return view;
}

// Browser snapshots are immutable. Share the projection across consumers.
const views = new WeakMap<Trace, Trace>();
export function traceCaptureView(trace: Trace): Trace {
  const cached = views.get(trace);
  if (cached) return cached;
  const structured = projectTraceCapture(trace);
  const view = structured.capture ? partialCaptureView(structured) : structured;
  views.set(trace, view);
  views.set(view, view);
  return view;
}
