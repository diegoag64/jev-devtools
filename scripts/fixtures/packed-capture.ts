import type { AnswerView, CaptureFidelity, Json, Trace } from "jev-devtools";
import { JevRecorder } from "jev-devtools/server";
import { score, TypeSafeClient } from "@typesafe-ai/sdk";

export function structuredScore(trace: Trace): string | undefined {
  return trace.result?.answers.q.score?.toFixed(2);
}
export const replacements: NonNullable<Trace["capture"]>[] = [
  { request: null },
  { result: { answers: { q: { score: "[redacted]" } } } },
  { request: false, result: [42, "ordinary user text"] },
];
const valid: AnswerView = { type: "score", score: 1 };
const fidelity: CaptureFidelity = "unknown";
const provenance: Trace["captureFidelity"] = {
  request: "exact",
  result: fidelity,
};
// @ts-expect-error Warning text and invented statuses are not fidelity metadata.
const invalidFidelity: CaptureFidelity = "lossless";
void provenance;
void invalidFidelity;
// @ts-expect-error Raw transformed content is not a structured numeric answer.
const invalid: AnswerView = { type: "score", score: "[redacted]" };
function raw(value: Json) {
  // @ts-expect-error Arbitrary capture JSON needs narrowing before field access.
  return value.answers.q.score.toFixed(2);
}
void valid;
void invalid;
void raw;

export async function captureExample(
  mode: "normal" | "root-null" | "score-string",
) {
  const recorder = new JevRecorder({
    redact: (path, value) =>
      mode === "root-null" && path.length === 0
        ? null
        : mode === "score-string" && path.at(-1) === "score"
          ? "[redacted]"
          : value,
  });
  const client = recorder.instrument(
    new TypeSafeClient({
      apiKey: "sample",
      logLevel: "off",
      fetch: recorder.transport(async () =>
        Response.json({
          model: "fixture",
          answers: { q: { type: "score", score: 1 } },
        }),
      ),
    }),
    { session: "local", label: mode, source: "sample" },
  );
  const result = await client.systemOne({
    state: "[redacted]",
    questions: { q: score("Rating?", ["Low", "High"]) },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { result, trace: recorder.snapshot("local")[0] };
}
