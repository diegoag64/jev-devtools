import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
export const doubleEach = defineJevFlow<{ numbers: number[] }>("double-each", (flow) => {
  const doubled = flow.map("double", {
    items: flow.input.get("numbers"),
    input: { multiplier: 2 },
    maxItems: 10,
    concurrency: 2,
  }, (item) => item.task("multiply", {
    input: {
      number: item.input.get("item"),
      multiplier: item.input.get("context").get("multiplier"),
    },
    run: ({ number, multiplier }) => number * multiplier,
  }));
  return flow.output("doubled", doubled);
});

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// 2. Call tryMap() from Node to execute the flow.
export async function tryMap() {
  const result = await doubleEach.run({ numbers: [2, 4, 6] }, { client: noInference });
  console.log(result.outcome); // "doubled"
  console.log(result.value); // [4, 8, 12]
  return result;
}
