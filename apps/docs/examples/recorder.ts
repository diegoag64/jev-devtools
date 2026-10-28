import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { JevRecorder } from "jev-devtools/server";

export const recorder = new JevRecorder({
  limit: 50,
  redact: (path, value, context) =>
    context.kind === "request" && path.at(-1) === "email"
      ? "[redacted]"
      : value,
});
export const client = recorder.instrument(
  new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
    fetch: recorder.transport(globalThis.fetch),
  }),
  { session: "local", label: "My request", source: "live" },
);

export const unsubscribe = recorder.subscribe((sessions) => {
  if (sessions.has("local")) {
    console.log(recorder.snapshot("local"));
  }
});
// Call unsubscribe() when the subscriber is no longer needed.

// Call await recordMessage("I was charged twice.") from your Node handler.
export async function recordMessage(message: string) {
  const result = await client.systemOne({
    state: { message },
    questions: {
      team: choice("Which team can help?", { billing: null, support: null }),
    },
  });
  console.log(result.answers.team.choice); // The model's selected team
  console.log(recorder.snapshot("local")); // The recorded request
  return result;
}

// Raw captures retain bounded redacted JSON; the drawer displays usable fields.
export function capturedContent(trace: import("jev-devtools").Trace) {
  return {
    request:
      trace.capture?.request !== undefined
        ? trace.capture.request
        : trace.request,
    result:
      trace.capture?.result !== undefined ? trace.capture.result : trace.result,
  };
}
