import { choice } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import { inspector, jev } from "./server.js";

// 1. Define the steps; no SDK request is sent here.
export const triage = defineJevFlow<{ message: string }>("triage", (flow) => {
  const classification = flow.jev("classify", {
    state: flow.input,
    questions: {
      team: choice("Which team can help?", {
        billing: "Charges and payments",
        other: "Everything else",
      }),
    },
  });

  return flow.branch("route", {
    when: classification.answer("team").choice.eq("billing"),
    then: (path) => path.output("billing-team"),
    else: (path) => path.output("support-team"),
  });
});

// 2. Call routeMessage("I was charged twice.") from your Node handler.
export async function routeMessage(message: string) {
  const result = await triage.run({ message }, { client: jev, devtools: inspector });
  console.log(result.outcome); // "billing-team" or "support-team", chosen by the flow
  return result;
}
