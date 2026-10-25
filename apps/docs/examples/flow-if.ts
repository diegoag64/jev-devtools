import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
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

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() { throw new Error("This example does not call Jev"); },
};

// 2. Call tryDelivery() from Node to execute the flow.
export async function tryDelivery() {
  const result = await delivery.run({ express: true }, { client: noInference });
  console.log(result.outcome); // "estimated"
  console.log(result.value); // "Delivery in 1 day(s)"
  return result;
}
