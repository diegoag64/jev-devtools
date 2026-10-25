import { choice } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

export const customQuestion = defineJevFlow<{ message: string }>(
  "custom-question",
  (flow) => {
    const result = flow.jev("ask", {
      input: flow.input.get("message"),
      request: (message) => ({
        state: { message },
        questions: {
          team: choice(`Who can help with: ${message}?`, {
            billing: null,
            support: null,
          }),
        },
      }),
    });
    return flow.output("answered", result.answers);
  },
);
