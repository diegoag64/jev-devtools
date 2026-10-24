import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { noul } from "@typesafe-ai/sdk";
import { createJevDevtools } from "../server/index.js";
import { defineJevFlow } from "../flow/index.js";
import { createDisplayRedactor } from "../src/display-redaction.js";

const origin = "http://localhost:5196";
const req = (session = "A", path = "", init: RequestInit = {}) =>
  new Request(origin + "/api/jev-devtools" + path, {
    ...init,
    headers: { origin, "x-session": session, ...init.headers },
  });
type Adapter = ReturnType<typeof createJevDevtools>;
async function snapshot(adapter: Adapter, session = "A", path = "/events") {
  const response = await adapter.handle(req(session, path));
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  try {
    const { value } = await reader.read();
    return JSON.parse(new TextDecoder().decode(value).split("data: ")[1]);
  } finally {
    await reader.cancel();
  }
}
const payload = {
  nested: [
    {
      "X-API-Key": "credential-header-alias",
      "X-Auth-Token": "credential-auth-header",
      client_secret: "credential-oauth-secret",
      sessionToken: "credential-session",
      ACCESS_TOKEN: "credential-access",
      refreshToken: "credential-refresh",
      "Proxy-Authorization": "credential-proxy",
      "Set-Cookie": "credential-cookie",
      password: "credential-password",
      privateKey: "credential-private-key",
      email: "personal@example.test",
      phone_number: "personal-phone",
      postalAddress: { street: "personal-street" },
      SSN: "personal-ssn",
      credit_card_number: "personal-card",
      internalNote: "custom-private",
      tokenCount: 12,
      sessionId: "session-label",
      apiKeyName: "key-label",
      secretary: "public-role",
      category: "public-category",
    },
  ],
};
const input = { state: payload, questions: { ok: noul("Okay?") } };
const body = {
  model: "fixture",
  answers: { ok: { type: "noul", noul: 0.8 } },
  metadata: payload,
};
const options = {
  apiKey: "transport-credential",
  logLevel: "off" as const,
  fetch: async () => Response.json(body),
};
function assertUseful(value: unknown) {
  const text = JSON.stringify(value);
  for (const useful of [
    "public-category",
    "public-role",
    "session-label",
    "key-label",
  ])
    assert.ok(text.includes(useful), useful + " must remain inspectable");
  assert.match(text, /"tokenCount":12/);
}
function assertCapture(value: unknown) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(
    text,
    /credential-/,
    "credential values must never reach captures",
  );
  assert.match(
    text,
    /personal@example.test/,
    "personal data remains available for display-only masking",
  );
  assert.doesNotMatch(text, /custom-private/);
  assertUseful(value);
}

test("credentials and custom redaction protect captures while personal data, SDK requests and runtime results stay unchanged", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    getSession: (r) => r.headers.get("x-session")!,
    redact: (path, value) =>
      path.at(-1) === "internalNote" ? "[custom]" : value,
  });
  t.after(() => adapter.dispose());
  const client = adapter.createClient({
    ...options,
    fetch: async (_url, init) => {
      assert.deepEqual(
        JSON.parse(String(init?.body)).state,
        payload,
        "SDK transport gets the unmodified request",
      );
      assert.ok(
        new Headers(init?.headers)
          .get("authorization")
          ?.includes("transport-credential"),
      );
      return Response.json(body);
    },
  });
  const original = structuredClone(payload);
  const raw = await adapter.run(req(), () =>
    client.systemOne(input).asResponse(),
  );
  assert.deepEqual(await raw.json(), body);
  await nextTurn();
  const [trace] = (await snapshot(adapter)).traces;
  assertCapture(trace.request.state);
  assertCapture(trace.result.metadata);
  assert.doesNotMatch(JSON.stringify(trace), /transport-credential/);
  const redactor = createDisplayRedactor();
  const displayedTrace = redactor.trace(trace);
  assert.doesNotMatch(
    JSON.stringify(displayedTrace),
    /personal[-@]|credential-|custom-private/,
  );
  assertUseful(displayedTrace);
  assert.equal(
    redactor.trace(trace),
    displayedTrace,
    "unchanged stream records reuse their display projection",
  );
  assertCapture(trace.request.state);
  const flow = defineJevFlow<typeof payload>("capture", (f) => {
    const task = f.task("copy", { input: f.input, run: (value) => value });
    const items = f.map(
      "items",
      { items: task.get("nested"), input: null, maxItems: 2 },
      (child) =>
        child.task("email", {
          input: child.input.get("item"),
          run: (value) => value,
        }),
    );
    return f.output("done", { copied: task, items });
  });
  const result = await adapter.run(req(), () =>
    flow.run(payload, { client, devtools: adapter }),
  );
  assert.deepEqual(result.value, { copied: original, items: original.nested });
  const [run] = (await snapshot(adapter, "A", "/flows/events")).upserts;
  assertCapture(run.steps.copy.data.input);
  assertCapture(run.steps.copy.data.output);
  assertCapture(run.value);
  const displayedRun = redactor.run(run);
  assert.doesNotMatch(
    JSON.stringify(displayedRun),
    /personal[-@]|credential-|custom-private/,
  );
  assert.equal(
    displayedRun.steps.items.collection!.items[0].run!.steps.email.status,
    "completed",
    "sensitive-looking structural step IDs must still render",
  );
  assertUseful(displayedRun);
  assert.equal(redactor.run(run), displayedRun);
  assertCapture(run.value);
  assertCapture((await snapshot(adapter)).traces[0].request.state);
  assert.deepEqual(payload, original);
});
