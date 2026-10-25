import { defineJevFlow } from "jev-devtools/flow";

export const greeting = defineJevFlow<{ name: string }>("greeting", (flow) => {
  const message = flow.task("make-message", {
    input: flow.input.get("name"),
    run: (name) => `Hello, ${name}!`,
  });
  return flow.output("greeted", message);
});
