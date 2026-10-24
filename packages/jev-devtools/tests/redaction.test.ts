import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { noul } from "@typesafe-ai/sdk";
import { createJevDevtools } from "../server/index.js";
import { defineJevFlow } from "../flow/index.js";

const origin = "http://localhost:5196";
const req = (session = "A", path = "", init: RequestInit = {}) =>
  new Request(origin + "/api/jev-devtools" + path, {
    ...init,
    headers: { origin, "x-session": session, ...init.headers },
  });
type Adapter = ReturnType<typeof createJevDevtools>;
const settings = (adapter: Adapter, session: string, value: boolean) =>
  adapter.handle(
    req(session, "/settings", {
      method: "PUT",
      body: JSON.stringify({ redactAdditionalSensitiveData: value }),
      headers: { "content-type": "application/json" },
    }),
  );
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
function assertCapture(value: unknown, additional: boolean, custom = false) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(
    text,
    /credential-/,
    "credential values must never reach captures",
  );
  if (additional) assert.doesNotMatch(text, /personal[-@]/);
  else assert.match(text, /personal@example.test/);
  if (custom) assert.doesNotMatch(text, /custom-private/);
  for (const useful of [
    "public-category",
    "public-role",
    "session-label",
    "key-label",
  ])
    assert.ok(text.includes(useful), useful + " must remain inspectable");
  assert.match(text, /"tokenCount":12/);
}

test("recursive credentials and default personal fields are removed from request, response, task and outcome captures without changing execution", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    getSession: (r) => r.headers.get("x-session")!,
  });
  t.after(() => adapter.dispose());
  const client = adapter.createClient(options);
  const original = structuredClone(payload);
  const raw = await adapter.run(req(), () =>
    client.systemOne(input).asResponse(),
  );
  assert.deepEqual(await raw.json(), body);
  await nextTurn();
  const [trace] = (await snapshot(adapter)).traces;
  assertCapture(trace.request.state, true);
  assertCapture(trace.result.metadata, true);
  assert.doesNotMatch(JSON.stringify(trace), /transport-credential/);
  const flow = defineJevFlow<typeof payload>("capture", (f) => {
    const task = f.task("copy", { input: f.input, run: (value) => value });
    return f.output("done", task);
  });
  const result = await adapter.run(req(), () =>
    flow.run(payload, { client, devtools: adapter }),
  );
  assert.deepEqual(result.value, original);
  const [run] = (await snapshot(adapter, "A", "/flows/events")).upserts;
  assertCapture(run.steps.copy.data.input, true);
  assertCapture(run.steps.copy.data.output, true);
  assertCapture(run.value, true);
  assert.deepEqual(payload, original);
});

test("session setting affects new captures, stays pinned in flight, and cannot disable credentials or custom redaction", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    getSession: (r) => r.headers.get("x-session")!,
    redact: (path, value) =>
      path.at(-1) === "internalNote" ? "[custom]" : value,
  });
  t.after(() => adapter.dispose());
  assert.equal(
    (await (await adapter.handle(req())).json()).redactAdditionalSensitiveData,
    true,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const client = adapter.createClient({
    ...options,
    fetch: async () => {
      await gate;
      return Response.json(body);
    },
  });
  const pending = adapter.run(req(), () => client.systemOne(input));
  await nextTurn();
  assert.equal((await settings(adapter, "A", false)).status, 200);
  release();
  await pending;
  await nextTurn();
  let traces = (await snapshot(adapter)).traces;
  assertCapture(traces[0].request.state, true, true);
  assertCapture(traces[0].result.metadata, true, true);
  await Promise.all(
    ["A", "B"].map((session) =>
      adapter.run(req(session), () => client.systemOne(input)),
    ),
  );
  await nextTurn();
  traces = (await snapshot(adapter)).traces;
  assertCapture(traces[0].request.state, false, true);
  assertCapture(traces[0].result.metadata, false, true);
  assertCapture(traces[1].request.state, true, true);
  assertCapture(
    (await snapshot(adapter, "B")).traces[0].request.state,
    true,
    true,
  );
  assert.equal((await settings(adapter, "A", true)).status, 200);
  assertCapture((await snapshot(adapter)).traces[0].request.state, false, true);
  await adapter.run(req(), () => client.systemOne(input));
  await nextTurn();
  assertCapture((await snapshot(adapter)).traces[0].request.state, true, true);
});

test("a flow pins its policy through nested tasks and linked requests while later runs use the new setting", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    getSession: (r) => r.headers.get("x-session")!,
  });
  t.after(() => adapter.dispose());
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const client = adapter.createClient(options);
  const flow = defineJevFlow<typeof payload>("pinned", (f) => {
    const task = f.task("wait", {
      input: f.input,
      run: async (value) => {
        started();
        await gate;
        return value;
      },
    });
    const items = f.map(
      "items",
      { items: task.get("nested"), input: null, maxItems: 2 },
      (child) => {
        const copy = child.task("copy", {
          input: child.input.get("item"),
          run: (value) => value,
        });
        child.jev("request", { state: copy, questions: input.questions });
        return copy;
      },
    );
    return f.output("done", items);
  });
  const pending = adapter.run(req(), () =>
    flow.run(payload, { client, devtools: adapter }),
  );
  await entered;
  assert.equal((await settings(adapter, "A", false)).status, 200);
  release();
  await pending;
  await nextTurn();
  assertCapture((await snapshot(adapter, "A", "/flows/events")).upserts, true);
  assertCapture((await snapshot(adapter)).traces, true);
  await adapter.run(req(), () =>
    flow.run(payload, { client, devtools: adapter }),
  );
  await nextTurn();
  const runs = (await snapshot(adapter, "A", "/flows/events")).upserts;
  assertCapture(runs[0], false);
  assertCapture(runs[1], true);
  assertCapture((await snapshot(adapter)).traces[0], false);
});

test("settings updates require same-origin authorization and valid booleans, and synchronize existing and reconnecting readers", async (t) => {
  const adapter = createJevDevtools({
    origin,
    enabled: true,
    getSession: (r) => r.headers.get("x-session")!,
    authorize: (r) => r.headers.get("x-session") !== "denied",
  });
  t.after(() => adapter.dispose());
  for (const [request, status] of [
    [
      req("denied", "/settings", {
        method: "PUT",
        body: '{"redactAdditionalSensitiveData":false}',
      }),
      403,
    ],
    [
      req("A", "/settings", {
        method: "PUT",
        headers: { origin: "https://evil.test" },
      }),
      403,
    ],
    [
      new Request(origin + "/api/jev-devtools/settings", {
        method: "PUT",
        headers: { "x-session": "A" },
      }),
      403,
    ],
    [req("A", "/settings", { method: "POST" }), 405],
    [req("A", "/settings", { method: "PUT", body: "invalid" }), 400],
    [
      req("A", "/settings", {
        method: "PUT",
        body: '{"redactAdditionalSensitiveData":"false"}',
      }),
      400,
    ],
  ] as const)
    assert.equal((await adapter.handle(request)).status, status);
  const readers = await Promise.all(
    [0, 1].map(async () =>
      (await adapter.handle(req("A", "/events?protocol=2"))).body!.getReader(),
    ),
  );
  t.after(async () => {
    await Promise.all(readers.map((r) => r.cancel()));
  });
  for (const reader of readers) {
    const initial = new TextDecoder().decode((await reader.read()).value);
    assert.match(initial, /"redactAdditionalSensitiveData":true/);
  }
  assert.equal((await settings(adapter, "A", false)).status, 200);
  for (const reader of readers) {
    const event = new TextDecoder().decode((await reader.read()).value);
    assert.match(event, /^event: settings/);
    assert.match(event, /"redactAdditionalSensitiveData":false/);
  }
  assert.equal((await snapshot(adapter)).redactAdditionalSensitiveData, false);
  assert.equal(
    (await snapshot(adapter, "B")).redactAdditionalSensitiveData,
    true,
  );
});
