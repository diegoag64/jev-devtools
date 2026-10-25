import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
export const totals = defineJevFlow<{ price: number }>("totals", (flow) => {
  const prices = flow.parallel("calculate", {
    regular: (lane) => lane.task("full-price", {
      input: lane.input.get("price"),
      run: (price) => price,
    }),
    sale: (lane) => lane.task("sale-price", {
      input: lane.input.get("price"),
      run: (price) => price * 0.8,
    }),
  });
  return flow.output("priced", { regular: prices.regular, sale: prices.sale });
});

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// 2. Call tryParallel() from Node to execute the flow.
export async function tryParallel() {
  const result = await totals.run({ price: 100 }, { client: noInference });
  console.log(result.outcome); // "priced"
  console.log(result.value); // { regular: 100, sale: 80 }
  return result;
}
