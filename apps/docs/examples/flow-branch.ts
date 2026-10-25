import { defineJevFlow } from "jev-devtools/flow";

export const route = defineJevFlow<{ needsReview: boolean }>("route", (flow) => {
  return flow.branch("pick-path", {
    when: flow.input.get("needsReview").eq(true),
    then: (path) => path.output("manual-review", "A person should review this"),
    else: (path) => path.output("ready", "Continue automatically"),
  });
});
