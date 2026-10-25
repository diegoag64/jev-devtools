import { choice } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

export const classify = defineJevFlow<{ message: string }>("classify", (flow) => {
  const result = flow.jev("ask-team", {
    state: flow.input,
    questions: {
      team: choice("Which team can help?", {
        billing: "Charges and payments",
        support: "Everything else",
      }),
    },
  });
  return flow.output("classified", result.answer("team").choice);
});
