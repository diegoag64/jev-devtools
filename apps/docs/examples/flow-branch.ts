import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
export const route = defineJevFlow<{ needsReview: boolean }>("route", (flow) => {
  return flow.branch("pick-path", {
    when: flow.input.get("needsReview").eq(true),
    then: (path) => path.output("manual-review", "A person should review this"),
    else: (path) => path.output("ready", "Continue automatically"),
  });
});

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// 2. Call tryBranch() from Node to execute the flow.
export async function tryBranch() {
  const result = await route.run({ needsReview: true }, { client: noInference });
  console.log(result.outcome); // "manual-review"
  console.log(result.value); // "A person should review this"
  return result;
}
