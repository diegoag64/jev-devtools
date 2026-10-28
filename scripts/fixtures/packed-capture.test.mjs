import assert from "node:assert/strict";
import { test } from "node:test";
import { captureExample, structuredScore } from "./packed-capture.js";

for (const mode of ["normal", "root-null", "score-string"]) {
  test(`packed public capture declarations and runtime agree: ${mode}`, async () => {
    const { result, trace } = await captureExample(mode);
    assert.equal(result.answers.q.score, 1);
    assert.equal(trace.status, "success");
    assert.equal(
      trace.captureFidelity.result,
      mode === "normal" ? "unknown" : "modified",
    );
    if (mode === "normal") {
      assert.equal(structuredScore(trace), "1.00");
      assert.equal(trace.capture, undefined);
    } else {
      assert.equal(structuredScore(trace), undefined);
      assert.ok(
        trace.captureWarnings.some((value) =>
          value.includes("structured view unavailable"),
        ),
      );
      if (mode === "root-null")
        assert.deepEqual(trace.capture, { request: null, result: null });
      else assert.equal(trace.capture.result.answers.q.score, "[redacted]");
    }
  });
}
