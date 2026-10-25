import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
export const greet = defineJevFlow<{ name: string }>("greet", (flow) => {
  return flow.output("greeted", flow.input.get("name"));
});

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// 2. Call tryGreeting() from Node to execute the flow.
export async function tryGreeting() {
  const result = await greet.run({ name: "Ada" }, { client: noInference });
  console.log(result.outcome); // "greeted"
  console.log(result.value); // "Ada"
  return result;
}
