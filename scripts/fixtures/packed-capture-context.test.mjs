import assert from "node:assert/strict";
import { test } from "node:test";
import { contextExample } from "./packed-capture-context.js";
test("packed CaptureContext declarations and callback runtime agree", async () => {
  const { kinds, result, run } = await contextExample();
  assert.ok(kinds.includes("step-data"));
  assert.ok(kinds.includes("outcome"));
  assert.deepEqual(result.value, { state: "original" });
  assert.deepEqual(run.value, { state: "outcome-only" });
  assert.equal(run.steps.work.data.output, "original");
});
