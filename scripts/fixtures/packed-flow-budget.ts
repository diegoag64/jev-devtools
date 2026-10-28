import assert from "node:assert/strict";
import { createJevDevtools, type CaptureOptions } from "jev-devtools/server";
import { defineJevFlow, type FlowRun, type FlowStep } from "jev-devtools/flow";

const options: CaptureOptions = { flowCaptureBytes: 0 };
// @ts-expect-error The byte allowance is numeric.
const invalid: CaptureOptions = { flowCaptureBytes: "1000" };
void invalid;
function metadata(run: FlowRun, step: FlowStep) {
  const value: "budget" | undefined = run.valueOmitted;
  const data: "budget" | undefined = step.dataOmitted;
  // @ts-expect-error Omission reasons are explicit, not arbitrary strings.
  run.valueOmitted = "truncated";
  // @ts-expect-error Data omission is not a boolean flag.
  step.dataOmitted = true;
  return { value, data };
}
void metadata;

const origin = "http://localhost:5196";
const adapter = createJevDevtools({ origin, enabled: true, ...options });
try {
  const flow = defineJevFlow("packed-budget", (f) =>
    f.output(
      "done",
      f.task("work", { input: "full", run: (input) => input.repeat(5000) }),
    ),
  );
  const result = await flow.run(null, {
    devtools: adapter,
    client: {
      systemOne(): never {
        throw new Error("Unexpected inference");
      },
    },
  });
  assert.equal(result.value, "full".repeat(5000));
  const response = await adapter.handle(
    new Request(origin + "/api/jev-devtools/flows/events"),
  );
  const reader = response.body!.getReader();
  try {
    const run: FlowRun = JSON.parse(
      new TextDecoder().decode((await reader.read()).value).split("data: ")[1],
    ).upserts[0];
    assert.equal(run.valueOmitted, "budget");
    assert.equal(run.value, undefined);
    assert.equal(run.steps.work.dataOmitted, "budget");
    assert.equal(run.steps.work.data, undefined);
    assert.equal(run.status, "success");
  } finally {
    await reader.cancel();
  }
} finally {
  adapter.dispose();
}
