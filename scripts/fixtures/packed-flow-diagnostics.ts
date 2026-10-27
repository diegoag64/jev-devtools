// Compiled against the installed archive and executed through its public exports.
import assert from "node:assert/strict";
import { defineJevFlow, FlowLoopLimitError } from "jev-devtools/flow";

const legacy: Error = new FlowLoopLimitError();
assert.equal(legacy.message, "Loop condition is still true at maxIterations");
const contextual = new FlowLoopLimitError("retry-check");
const stepId: string | undefined = contextual.stepId;
assert.equal(stepId, "retry-check");

// Compile-only checks: context stays optional and accepts only a step ID string.
function invalidConsumerUsage(error: FlowLoopLimitError) {
  // @ts-expect-error the constructor does not accept a numeric ID
  new FlowLoopLimitError(1);
  // @ts-expect-error legacy construction has no step identity
  const requiredId: string = error.stepId;
  // @ts-expect-error consumers cannot overwrite diagnostic identity
  error.stepId = "other";
  return requiredId;
}
void invalidConsumerUsage;

const flow = defineJevFlow("packed-loop-diagnostic", (f) => {
  const state = f.loop(
    "retry-check",
    {
      initial: 0,
      input: null,
      while: (s) => s.lt(2),
      maxIterations: 1,
    },
    (r) =>
      r.task("advance", { input: r.input.get("state"), run: (n) => n + 1 }),
  );
  return f.output("done", state);
});
await assert.rejects(
  flow.run(null, {
    client: {
      systemOne() {
        throw new Error("Unexpected inference");
      },
    },
  }),
  (error) => {
    assert.ok(error instanceof FlowLoopLimitError);
    assert.equal(error.stepId, "retry-check");
    assert.equal(
      error.message,
      'Loop "retry-check" condition is still true at maxIterations',
    );
    return true;
  },
);
console.log("Packed loop diagnostics: passed");
