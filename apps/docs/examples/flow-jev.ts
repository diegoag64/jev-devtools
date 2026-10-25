import { choice, type TypeSafeClient } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the request. This does not contact Jev.
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

// 2. Call tryClassify(jev) from your Node handler.
// jev is the client created in the server setup; it needs a real API key.
export async function tryClassify(client: TypeSafeClient) {
  const result = await classify.run(
    { message: "I was charged twice." },
    { client },
  );
  console.log(result.outcome); // "classified"
  console.log(result.value); // "billing" or "support", chosen by the model
  return result;
}
