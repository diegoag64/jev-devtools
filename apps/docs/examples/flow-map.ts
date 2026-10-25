import { defineJevFlow } from "jev-devtools/flow";

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
