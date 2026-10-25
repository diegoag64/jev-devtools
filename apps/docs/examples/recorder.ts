import { TypeSafeClient } from "@typesafe-ai/sdk";
import { JevRecorder } from "jev-devtools/server";

export const recorder = new JevRecorder({ limit: 50 });
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
