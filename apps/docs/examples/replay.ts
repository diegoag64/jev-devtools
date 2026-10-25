// Unreleased: use the working-tree package, not npm 0.4.1.
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
  return flow.run(
    { message: "I was charged twice." },
    { client: replayClient(fixture) },
  );
  // outcome: "routed", value: "billing". No key or inference call.
}
