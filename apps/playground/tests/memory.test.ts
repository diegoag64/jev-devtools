import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  memoryCases,
  type MemoryCase,
} from "../../../cookbooks/simple-memory/cases.js";
import {
  memoryFlow,
  type MemoryResult,
} from "../../../cookbooks/simple-memory/flow.js";
import { memorySampleTransport } from "../../../cookbooks/simple-memory/samples.js";
function run(caseId: MemoryCase) {
  const requests: any[] = [];
  const sample = memorySampleTransport(caseId, 0);
  const client = new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return sample(url, init);
    },
  });
  return {
    requests,
    result: memoryFlow
      .run({ caseId, message: memoryCases[caseId].message }, { client })
      .then((r) => r.value as MemoryResult),
  };
}
test("memory replay isolates customers, stores original tickets and readable answers, and uses those memories on later routes", async () => {
  const { requests, result } = run("timeline");
  const value = await result;
  assert.equal(requests.length, 28);
  assert.equal(value.requests, 28);
  assert.equal(value.history.length, 11);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(value.memories).map(([cid, items]) => [
        cid,
        items.map((m) => m.request.ticket.id),
      ]),
    ),
    { "C-1042": ["T-101", "T-105"], "C-2210": ["T-102"] },
  );
  const key = "earlier_tickets_from_this_customer";
  const route = requests.filter((r) => r.questions.team);
  const gates = requests.filter((r) => r.questions.remember);
  assert.equal(gates.length, 11);
  for (const request of route) {
    assert.equal(request.model, "jev-1.13.0");
    for (const memory of request.state[key] ?? [])
      assert.equal(memory.request.customer.id, request.state.customer.id);
  }
  // Both first tickets lack even an empty memory key.
  assert.ok(!(key in route[0].state));
  assert.ok(!(key in route[1].state));
  const later = route.filter((r) => r.state.ticket.id === "T-201");
  assert.equal(later.length, 2);
  assert.ok(!(key in later[0].state));
  assert.deepEqual(
    later[1].state[key].map((m: any) => m.request.ticket.id),
    ["T-101", "T-105"],
  );
  const question = "Which support team should handle `ticket`?";
  for (const gate of gates) {
    assert.ok(!(key in gate.state.request));
    assert.equal(typeof gate.state.jev_answered[question], "string");
    assert.ok(gate.state.jev_answered[question].includes(":"));
  }
  assert.equal(
    value.memories["C-1042"][0].jev_answered[question],
    "Self-hosted team, Windows: installs, upgrades and performance of the self-hosted edition on Windows Server",
  );
  assert.equal(value.history[1].routed.choice, "general");
  assert.equal(value.history[1].saved, true); // gate judges facts, not whether the routed answer is technical
  assert.deepEqual(
    value.history
      .filter((t) => t.compare)
      .map((t) => [t.plain!.choice, t.routed.choice, t.saved]),
    [
      ["cloud_ops", "selfhosted_windows", false],
      ["none_suitable", "selfhosted_windows", false],
      ["billing", "enterprise_desk", false],
      ["cloud_ops", "cloud_ops", false],
      ["cloud_ops", "cloud_ops", false],
      ["enterprise_desk", "billing", false],
    ],
  );
});
test("memory save boundary is inclusive, transient tickets leave no memory, and simultaneous replays start fresh", async () => {
  const runs = [
    run("boundary"),
    run("below"),
    run("transient"),
    run("boundary"),
  ];
  const [at, below, transient, repeat] = await Promise.all(
    runs.map((r) => r.result),
  );
  assert.equal(at.history[0].remember, 0.5);
  assert.equal(at.history[0].saved, true);
  assert.equal(at.history[1].routed.choice, "selfhosted_windows");
  assert.equal(below.history[0].remember, 0.499);
  assert.deepEqual(below.memories, {});
  assert.equal(below.history[1].routed.choice, "cloud_ops");
  assert.deepEqual(transient.memories, {});
  assert.ok(
    transient.history.every(
      (t) => t.before.length === 0 && t.after.length === 0 && !t.saved,
    ),
  );
  assert.deepEqual(repeat, at);
  for (const r of runs)
    assert.ok(!("earlier_tickets_from_this_customer" in r.requests[0].state));
});
test("memory samples reject unexpected state and aborting the remember request prevents the next ticket", async () => {
  const sample = memorySampleTransport("boundary", 0);
  await assert.rejects(
    sample("https://sample.invalid", {
      body: JSON.stringify({ model: "jev-1.13.0", state: {}, questions: {} }),
    }),
    /does not match/,
  );
  let entered!: () => void;
  const gateStarted = new Promise<void>((r) => {
    entered = r;
  });
  const controller = new AbortController();
  const transport = memorySampleTransport("boundary", 30);
  const requests: any[] = [];
  const client = new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: (url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (body.questions.remember) entered();
      return transport(url, init);
    },
  });
  const result = memoryFlow.run(
    { caseId: "boundary", message: memoryCases.boundary.message },
    { client, signal: controller.signal },
  );
  const rejected = assert.rejects(result);
  await gateStarted;
  controller.abort();
  await rejected;
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every(
      (r) => (r.state.ticket ?? r.state.request.ticket).id === "T-101",
    ),
  );
});
