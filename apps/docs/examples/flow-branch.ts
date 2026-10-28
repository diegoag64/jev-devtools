import { defineJevFlow } from "jev-devtools/flow";

// 1. Define the steps. No application work runs here.
export const route = defineJevFlow<{ needsReview: boolean }>("route")((
  flow,
) => {
  return flow.branch("pick-path", {
    when: flow.input.get("needsReview").eq(true),
    then: (path) => {
      const receipt = path.task("review-receipt", {
        input: {
          message: "A person should review this",
          needsReview: path.input.get("needsReview"),
        },
        run: (value) => value,
      });
      return path.output("manual-review", receipt);
    },
    else: (path) => path.output("ready", 1),
  });
});

// This flow has no Jev steps: no API key or network access is needed.
const noInference = {
  systemOne() {
    throw new Error("This example does not call Jev");
  },
};

// 2. Call tryBranch() from Node to execute the flow.
export async function tryBranch() {
  const result = await route.run(
    { needsReview: true },
    { client: noInference },
  );
  console.log(result.outcome); // "manual-review"
  if (result.outcome === "manual-review") {
    console.log(result.value.message.toUpperCase()); // "A PERSON SHOULD REVIEW THIS"
  } else {
    console.log(result.value.toFixed(0)); // "1"
  }
  return result;
}
