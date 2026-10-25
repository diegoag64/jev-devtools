import { defineJevFlow } from "jev-devtools/flow";

const join = defineJevFlow<{}>("join", (flow) => {
  const results = flow.parallel("load", {
    left: (lane) => lane.task("left-value", { input: 2, run: (n) => n * 2 }),
    right: (lane) => lane.task("right-value", { input: 3, run: (n) => n * 3 }),
  });
  return flow.output("joined", { left: results.left, right: results.right });
});

// Call tryJoin() from Node. This definition has no Jev requests.
export async function tryJoin() {
  const noInference = {
    systemOne() { throw new Error("This example does not call Jev"); },
  };
  const result = await join.run({}, { client: noInference });
  console.log(result.outcome); // "joined"
  console.log(result.value); // { left: 4, right: 9 }
  return result;
}
