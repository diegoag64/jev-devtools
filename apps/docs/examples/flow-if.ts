import { defineJevFlow } from "jev-devtools/flow";

export const delivery = defineJevFlow<{ express: boolean }>("delivery", (flow) => {
  const days = flow.if("choose-speed", {
    when: flow.input.get("express").eq(true),
    then: (path) => path.task("fast", { input: 1, run: (n) => n }),
    else: (path) => path.task("standard", { input: 5, run: (n) => n }),
  });
  const message = flow.task("describe", {
    input: days,
    run: (n) => `Delivery in ${n} day(s)`,
  });
  return flow.output("estimated", message);
});
