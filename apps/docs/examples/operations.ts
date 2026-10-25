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

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// Call tryOperations() from Node. Each await starts and waits for a fresh run.
export async function tryOperations() {
  const summary = await summarize.run({ values: [2, 4] }, { client: noInference });
  console.log(summary.outcome); // "summary"
  console.log(summary.value); // { total: 12, label: "Large: 12" }

  const counted = await count.run({ target: 3 }, { client: noInference });
  console.log(counted.outcome); // "counted"
  console.log(counted.value); // { value: 3, target: 3 }
  return { summary, counted };
}
