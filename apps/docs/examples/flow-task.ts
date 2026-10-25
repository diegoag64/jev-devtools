import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
export const greeting = defineJevFlow<{ name: string }>("greeting", (flow) => {
  const message = flow.task("make-message", {
    input: flow.input.get("name"),
    run: (name) => `Hello, ${name}!`,
  });
  return flow.output("greeted", message);
});

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// 2. Call tryTask() from Node to execute the flow.
export async function tryTask() {
  const result = await greeting.run({ name: "Ada" }, { client: noInference });
  console.log(result.outcome); // "greeted"
  console.log(result.value); // "Hello, Ada!"
  return result;
}
