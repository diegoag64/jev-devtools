import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
export const countToThree = defineJevFlow<{}>("count-to-three", (flow) => {
  const count = flow.loop("count", {
    initial: 0,
    input: {},
    while: (state) => state.lt(3),
    maxIterations: 3,
  }, (iteration) => iteration.task("increment", {
    input: iteration.input.get("state"),
    run: (state) => state + 1,
  }));
  return flow.output("counted", count);
});

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// 2. Call tryLoop() from Node to execute the flow.
export async function tryLoop() {
  const result = await countToThree.run({}, { client: noInference });
  console.log(result.outcome); // "counted"
  console.log(result.value); // 3
  return result;
}
