import { defineJevFlow } from "jev-devtools/flow";

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
