import { defineJevFlow } from "jev-devtools/flow";

export const greet = defineJevFlow<{ name: string }>("greet", (flow) => {
  return flow.output("greeted", flow.input.get("name"));
});

// This flow has no Jev steps, so it needs no key or network access.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};
export async function tryGreeting() {
  return greet.run({ name: "Ada" }, { client: noInference });
  // { runId: "...", outcome: "greeted", value: "Ada" }
}
