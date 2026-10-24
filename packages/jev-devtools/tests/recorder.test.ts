import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { TypeSafeClient, noul, choice } from "@typesafe-ai/sdk";
import { JevRecorder } from "../server/recorder";
import { sampleTransport, makeRequest } from "./support/transport";
import type { Fetch } from "@typesafe-ai/sdk";

const meta = { session: "one", label: "Test", source: "sample" as const };
function setup(
  scenario: "triage" | "retry" | "error" | "image" = "triage",
  recorder = new JevRecorder(),
) {
  const client = recorder.instrument(
    new TypeSafeClient({
      apiKey: "test-secret",
      logLevel: "off",
      fetch: recorder.transport(sampleTransport(scenario)),
      retry: { maxRetries: scenario === "retry" ? 1 : 0 },
    }),
    meta,
  );
  return { client, recorder };
}
async function settled(recorder: JevRecorder, session = "one") {
  for (let n = 0; n < 100; n++) {
    const traces = recorder.snapshot(session);
    if (traces.length && traces.every((t) => t.status !== "pending"))
      return traces;
    await delay(10);
  }
  assert.fail("Recorder did not settle");
}
// The SDK is real in these tests. Fetch is its supported custom transport;
// assertions cover recorder ownership/lifecycle, not fixture answer accuracy.
test("preserves typed APIPromise helpers and readable raw response while recording an independent snapshot", async () => {
  const { client, recorder } = setup();
  const request = {
    state: { message: "original", apiKey: "private" },
    questions: {
      category: choice("Team?", {
        billing: "Billing",
        delivery: "Delivery",
        other: "Other",
      }),
    },
  };
  const pending = client.systemOne(request);
  request.state.message = "mutated";
  const raw = await pending.asResponse();
  assert.equal(raw.bodyUsed, false);
  const payload = await raw.json();
  assert.equal(payload.answers.category.choice, "billing");
  const [trace] = await settled(recorder);
  assert.equal(
    (trace.request.state as Record<string, unknown>).message,
    "original",
  );
  assert.equal(
    (trace.request.state as Record<string, unknown>).apiKey,
    "[redacted]",
  );
  trace.label = "changed";
  assert.equal(recorder.snapshot("one")[0].label, "Test");
  const typed = client.systemOne(request);
  const mapped: Promise<"billing" | "delivery" | "other"> = typed.map(
    (result) => result.answers.category.choice,
  );
  assert.equal(await mapped, "billing");
  const { data, response, requestId } = await typed.withResponse();
  assert.equal(data.answers.category.choice, "billing");
  assert.equal(response.status, 200);
  assert.ok(requestId);
});
test("keeps one logical request through a rate-limit retry", async () => {
  const { client, recorder } = setup("retry");
  await client.systemOne(await makeRequest("triage"));
  const traces = await settled(recorder);
  assert.equal(traces.length, 1);
  assert.equal(traces[0].status, "success");
  assert.deepEqual(
    traces[0].attempts.map((a) => a.status),
    [429, 200],
  );
  assert.equal(traces[0].requestId, "sample-retry-2");
});
test("captures SDK error and cancellation without turning either into success", async () => {
  for (const scenario of ["error", "cancel"] as const) {
    const { client, recorder } = setup(
      scenario === "error" ? "error" : "triage",
    );
    const controller = new AbortController();
    const pending = client.systemOne(await makeRequest("triage"), {
      signal: controller.signal,
    });
    if (scenario === "cancel") setTimeout(() => controller.abort(), 30);
    await assert.rejects(pending);
    const [trace] = await settled(recorder);
    assert.equal(trace.status, scenario === "cancel" ? "cancelled" : "error");
    assert.ok(trace.error?.name);
    assert.equal(trace.result, undefined);
  }
});
test("isolates concurrent sessions and transport attempts, with bounded retention and observer failure containment", async () => {
  const recorder = new JevRecorder({
    limit: 2,
    redact: (path, value) => (path.at(-1) === "email" ? "[redacted]" : value),
  });
  recorder.subscribe(() => {
    throw new Error("Observer failed");
  });
  const fetcher: Fetch = async (_url, init) => {
    const tag = new Headers(init?.headers).get("x-test-tag");
    await delay(tag === "slow" ? 60 : 5);
    return Response.json(
      {
        model: "sample",
        answers: { ok: { type: "noul", noul: tag === "slow" ? 0.1 : 0.9 } },
      },
      { headers: { "x-typesafe-request-id": tag! } },
    );
  };
  const wrap = (session: string) =>
    recorder.instrument(
      new TypeSafeClient({
        apiKey: "private",
        logLevel: "off",
        fetch: recorder.transport(fetcher),
      }),
      { ...meta, session },
    );
  const request = {
    state: { email: "private@example.com" },
    questions: { ok: noul("Okay?") },
  };
  await Promise.all([
    wrap("one").systemOne(request, { headers: { "x-test-tag": "slow" } }),
    wrap("two").systemOne(request, { headers: { "x-test-tag": "fast" } }),
  ]);
  const [one] = await settled(recorder, "one"),
    [two] = await settled(recorder, "two");
  assert.equal(one.requestId, "slow");
  assert.equal(one.result?.answers.ok.noul, 0.1);
  assert.equal(one.attempts.length, 1);
  assert.equal(two.requestId, "fast");
  assert.equal(two.result?.answers.ok.noul, 0.9);
  assert.equal(two.attempts.length, 1);
  assert.equal(
    (one.request.state as Record<string, unknown>).email,
    "[redacted]",
  );
  await wrap("two").systemOne(request, { headers: { "x-test-tag": "third" } });
  await settled(recorder, "two");
  assert.equal(recorder.snapshot("one").length, 0);
  assert.equal(recorder.snapshot("two").length, 2);
  recorder.clear("one");
  assert.equal(recorder.snapshot("two").length, 2);
  recorder.clear("two");
  assert.deepEqual(recorder.snapshot("two"), []);
});
test("captures an image reference and Box response through SDK multipart serialization", async () => {
  const { client, recorder } = setup("image");
  await client.systemOne(await makeRequest("image"));
  const [trace] = await settled(recorder);
  assert.equal(trace.status, "success");
  const photo = (trace.request.state as Record<string, any>).photo;
  assert.match(photo.preview, /^data:image\/png;base64,/);
  assert.ok(photo.bytes > 0);
  assert.equal(trace.result?.answers.mug.box?.left, 0.35);
});

test("large Choice captures retain every supported category and probability", async () => {
  const names = Array.from({ length: 182 }, (_, i) => `category-${i}`);
  const probabilities = Object.fromEntries(
    names.map((name, i) => [name, i === 181 ? 1 : 0]),
  );
  const recorder = new JevRecorder();
  const client = recorder.instrument(
    new TypeSafeClient({
      apiKey: "sample-only",
      logLevel: "off",
      retry: { maxRetries: 0 },
      fetch: recorder.transport(async () =>
        Response.json({
          model: "fixture",
          answers: {
            selected: {
              type: "choice",
              choice: "category-181",
              probabilities,
              confidence: 1,
            },
          },
        }),
      ),
    }),
    meta,
  );
  await client.systemOne({
    state: "Select the final category",
    questions: {
      selected: choice(
        "Select?",
        Object.fromEntries(names.map((name) => [name, `Description ${name}`])),
      ),
    },
  });
  const [trace] = await settled(recorder);
  assert.equal(
    Object.keys(trace.result!.answers!.selected.probabilities!).length,
    182,
  );
  assert.equal(
    trace.result!.answers!.selected.probabilities!["category-181"],
    1,
  );
  assert.equal(
    Object.keys(trace.request.questions.selected.criteria!).length,
    182,
  );
});
