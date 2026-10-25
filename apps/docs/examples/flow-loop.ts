import { defineJevFlow } from "jev-devtools/flow";

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
