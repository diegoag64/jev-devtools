// request.ts (Node only)
import { choice } from "@typesafe-ai/sdk";
import { jev } from "./server.js";

export async function classifyMessage(message: string) {
  const result = await jev.systemOne({
    state: { message },
    questions: {
      team: choice("Which team can help?", {
        billing: "Charges and payments",
        delivery: "Shipping and tracking",
        other: "Everything else",
      }),
    },
  });
  console.log(result.answers.team.choice); // The selected team from the SDK response
  return result;
}
