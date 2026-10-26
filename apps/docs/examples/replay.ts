// Requires jev-devtools 0.5.0 or later.
import { choice } from "@typesafe-ai/sdk";
import {
  defineJevFlow,
  replayClient,
  type FlowFixture,
} from "jev-devtools/flow";

export async function replayExample() {
  const flow = defineJevFlow<{ message: string }>("saved-triage", (flow) => {
    const result = flow.jev("classify", {
      state: flow.input,
      questions: {
        team: choice("Which team?", { billing: null, other: null }),
      },
    });
    return flow.output("routed", result.answer("team").choice);
  });

  // A hand-written fixture; Copy fixture can produce this shape from a run.
  const fixture: FlowFixture = {
    version: 1,
    flow: "saved-triage",
    steps: {
      classify: {
        model: "jev-sample",
        answers: {
          team: {
            type: "choice",
            choice: "billing",
            probabilities: { billing: 0.8, other: 0.2 },
            confidence: 0.6,
          },
        },
      },
    },
  };
  const result = await flow.run(
    { message: "I was charged twice." },
    { client: replayClient(fixture) },
  );
  console.log(result.outcome); // "routed"
  console.log(result.value); // "billing" from the fixture; no inference call
  return result;
}
