import { choice } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import { inspector, jev } from "./server.js";

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

export async function routeMessage(message: string) {
  return triage.run({ message }, { client: jev, devtools: inspector });
}
