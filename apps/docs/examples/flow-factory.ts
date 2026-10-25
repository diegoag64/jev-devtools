import { choice, type TypeSafeClient } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the request. This does not contact Jev.
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

// 2. Call tryCustomQuestion(jev) from your Node handler.
// jev is the client created in the server setup; it needs a real API key.
export async function tryCustomQuestion(client: TypeSafeClient) {
  const result = await customQuestion.run(
    { message: "I was charged twice." },
    { client },
  );
  console.log(result.outcome); // "answered"
  console.log(result.value); // The full answer object, including team and its metadata
  return result;
}
