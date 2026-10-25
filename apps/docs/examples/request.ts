// An application handler on your Node server.
import { choice } from "@typesafe-ai/sdk";
import { jev } from "./server.js";

export async function classifyMessage(message: string) {
  return jev.systemOne({
    state: { message },
    questions: {
      team: choice("Which team can help?", {
        billing: "Charges and payments",
        delivery: "Shipping and tracking",
        other: "Everything else",
      }),
    },
  });
}
