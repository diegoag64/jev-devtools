import { defineJevFlow, all, not } from "jev-devtools/flow";

export const summarize = defineJevFlow<{ values: number[] }>(
  "summarize",
  (flow) => {
    const doubled = flow.map(
      "double",
      {
        items: flow.input.get("values"),
        input: {},
        maxItems: 20,
        concurrency: 2,
      },
      (item) =>
        item.task("multiply", {
          input: item.input.get("item"),
          run: (value) => value * 2,
        }),
    );

    const total = flow.task("total", {
      input: doubled,
      run: (values) => values.reduce((sum, value) => sum + value, 0),
    });

    const label = flow.if("label", {
      when: all(total.gt(10), not(total.eq(20))),
      then: (path) =>
        path.task("large", { input: total, run: (n) => `Large: ${n}` }),
      else: (path) =>
        path.task("regular", { input: total, run: (n) => `Regular: ${n}` }),
    });
    return flow.output("summary", { total, label });
  },
);

export const count = defineJevFlow<{ target: number }>("count", (flow) => {
  const initial = flow.task("initial", {
    input: flow.input.get("target"),
    run: (target) => ({ value: 0, target }),
  });
  const finalState = flow.loop(
    "advance",
    {
      initial,
      input: {},
      while: (state) => state.get("value").lt(state.get("target")),
      maxIterations: 10,
    },
    (iteration) =>
      iteration.task("increment", {
        input: iteration.input.get("state"),
        run: (state) => ({ ...state, value: state.value + 1 }),
      }),
  );
  return flow.output("counted", finalState);
});
