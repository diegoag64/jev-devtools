import {
  capturedValue,
  captureFieldUnavailable,
  unavailableCaptureFields,
} from "./capture-view.js";
import type { Trace } from "./protocol.js";

const labels: Record<string, string> = {
  request: "Request",
  result: "Response",
  questions: "Questions",
  answers: "Answers",
  score: "Score",
  noul: "Probability of true",
  confidence: "Confidence",
  choice: "Choice",
  probabilities: "Probabilities",
  legend: "Legend",
  box: "Box",
  type: "Type",
  model: "Model",
  state: "Context",
};
const label = (parts: readonly string[]) =>
  parts
    .map((part) => (Object.hasOwn(labels, part) ? labels[part] : part))
    .join(" · ");

/** Missing paths come from shape checks, never from redaction marker strings. */
export function CaptureFields({
  trace,
  path,
}: {
  trace: Trace;
  path: readonly string[];
}) {
  const fields = captureFieldUnavailable(trace, path)
    ? [path]
    : unavailableCaptureFields(trace, path);
  return (
    <>
      {fields.map((field) => (
        <p className="muted" key={JSON.stringify(field)}>
          {label(
            field.slice(path.length).length
              ? field.slice(path.length)
              : path.slice(-1),
          )}{" "}
          unavailable in this capture.
        </p>
      ))}
    </>
  );
}

/** A partial box has readable coordinates but cannot define an overlay. */
export function PartialBox({ trace, name }: { trace: Trace; name: string }) {
  if (trace.result?.answers[name]?.box) return null;
  const value = capturedValue(trace, ["result", "answers", name, "box"]);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const coordinates = Object.entries(value).flatMap(([key, value]) =>
    typeof value === "number" && Number.isFinite(value)
      ? [`${key} ${value.toFixed(2)}`]
      : [],
  );
  return coordinates.length ? (
    <p className="muted">{coordinates.join(" · ")} · Box overlay unavailable</p>
  ) : null;
}
