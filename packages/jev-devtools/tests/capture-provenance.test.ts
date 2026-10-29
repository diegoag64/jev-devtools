import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Image, TypeSafeClient, score, choice, noul } from "@typesafe-ai/sdk";
import type { Fetch } from "@typesafe-ai/sdk";
import { createJevDevtools } from "jev-devtools/server";
import { defineJevFlow } from "jev-devtools/flow";
import type { FlowDefinition, FlowRun } from "jev-devtools/flow";
import { TraceStore } from "../src/trace-store.js";
import { parseFlowUpdate } from "../src/flow-parser.js";
import { jsonSnapshot, observerSnapshot } from "../flow/runtime.js";

const origin = "http://localhost:5197";
const client = {
  systemOne(): never {
    throw new Error("Unexpected inference");
  },
};
async function event(
  inspector: ReturnType<typeof createJevDevtools>,
  path: string,
) {
  const response = await inspector.handle(new Request(origin + path));
  const reader = response.body!.getReader();
  try {
    const first = await reader.read();
    const input: unknown = JSON.parse(
      new TextDecoder().decode(first.value).split("data: ")[1],
    );
    return input;
  } finally {
    await reader.cancel();
  }
}
async function flowHistory(inspector: ReturnType<typeof createJevDevtools>) {
  const parsed = parseFlowUpdate(
    await event(inspector, "/api/jev-devtools/flows/events"),
    new Map(),
    new Map(),
  );
  return [...parsed.runs.values()][0];
}

// Count explicit descriptor work at its owning source object, including bulk
// materialization. No timing assertion or fabricated SDK behavior is needed.
function descriptorProbe(target: object) {
  const one = Object.getOwnPropertyDescriptor;
  const all = Object.getOwnPropertyDescriptors;
  let count = 0;
  Object.getOwnPropertyDescriptor = (value, key) => {
    if (value === target) count++;
    return one(value, key);
  };
  Object.getOwnPropertyDescriptors = (value) => {
    const result = all(value);
    if (value === target) count += Reflect.ownKeys(result).length;
    return result;
  };
  return {
    count: () => count,
    restore() {
      Object.getOwnPropertyDescriptor = one;
      Object.getOwnPropertyDescriptors = all;
    },
  };
}

// The SDK consumes these fields outside JSON enumeration. Hidden question
// getters install valid enumerable fields before sending. Inspector and plain
// SDK controls must send identical values with identical accessor counts.
for (const kind of [
  "plain",
  "assets",
  "score-criteria",
  "choice-criteria",
  "noul-instructions",
  "type",
] as const) {
  test(`SDK omitted-field provenance: ${kind}`, async () => {
    const counts: number[] = [];
    for (const observed of [false, true]) {
      const inspector = observed
        ? createJevDevtools({ origin, enabled: true })
        : undefined;
      const q =
        kind === "choice-criteria"
          ? choice("q", { lo: "low", hi: "high" })
          : kind === "noul-instructions"
            ? noul("q", { true: "yes", false: "no" })
            : score("q", ["lo", "hi"]);
      const request = {
        state: { score: 0.9, attachment: "photo" },
        questions: { q },
      };
      let reads = 0;
      let sentState: unknown;
      if (kind === "assets") {
        const image = Image.fromBase64(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=",
        );
        Object.defineProperty(request, "assets", {
          value: {
            get photo() {
              reads++;
              request.state.score = 0.6;
              return image;
            },
          },
          enumerable: false,
        });
      } else if (kind !== "plain") {
        const key =
          kind === "noul-instructions"
            ? "instructions"
            : kind === "type"
              ? "type"
              : "criteria";
        const value = Reflect.get(q, key);
        Object.defineProperty(q, key, {
          enumerable: false,
          configurable: true,
          get() {
            reads++;
            request.state.score = 0.6;
            Object.defineProperty(q, key, {
              value,
              enumerable: true,
              configurable: true,
            });
            return value;
          },
        });
      }
      const fetch: Fetch = async (_url, init) => {
        const text =
          typeof init?.body === "string"
            ? init.body
            : await new Response(init?.body).text();
        const data: unknown = JSON.parse(
          text.startsWith("{")
            ? text
            : text.split("\r\n\r\n")[1].split("\r\n--")[0],
        );
        assert.ok(data && typeof data === "object" && "state" in data);
        sentState = data.state;
        return Response.json({
          model: "sample",
          answers: {
            q:
              q.type === "noul"
                ? { type: "noul", noul: 0.9 }
                : q.type === "choice"
                  ? { type: "choice", choice: "hi" }
                  : { type: "score", score: 0.9 },
          },
        });
      };
      const options = {
        apiKey: "sample",
        logLevel: "off" as const,
        compression: false as const,
        fetch,
      };
      const sdk = inspector
        ? inspector.createClient(options)
        : new TypeSafeClient(options);
      try {
        await sdk.systemOne(request);
        await nextTurn();
        await nextTurn();
        assert.deepEqual(sentState, {
          score: kind === "plain" ? 0.9 : 0.6,
          attachment: "photo",
        });
        counts.push(reads);
        if (inspector) {
          const [trace] = new TraceStore().apply(
            "snapshot",
            await event(inspector, "/api/jev-devtools/events"),
          );
          assert.equal(
            trace.captureFidelity?.request,
            kind === "plain"
              ? "exact"
              : kind === "type"
                ? "modified"
                : "unknown",
          );
          assert.equal(trace.captureFidelity?.result, "exact");
          if (kind !== "type") {
            assert.deepEqual(trace.request.state, {
              score: 0.9,
              attachment: "photo",
            });
            assert.deepEqual(trace.captureWarnings, []);
          }
        }
      } finally {
        inspector?.dispose();
      }
    }
    assert.equal(counts[0], kind === "plain" ? 0 : kind === "assets" ? 3 : 1);
    assert.equal(
      counts[1],
      counts[0],
      "provenance must not invoke SDK getters again",
    );
  });
}

for (const width of [150, 151, 10000]) {
  test(`recorder descriptor work is bounded by retained fields: ${width}`, async (t) => {
    const inspector = createJevDevtools({ origin, enabled: true });
    t.after(() => inspector.dispose());
    const definition: FlowDefinition = {
      version: 1,
      id: "d",
      name: "bounded",
      nodes: [],
    };
    const value = Object.fromEntries(
      Array.from({ length: width }, (_, i) => [`key${i}`, i]),
    );
    const run: FlowRun = {
      version: 1,
      id: "r",
      definitionId: "d",
      name: "bounded",
      status: "success",
      startedAt: 0,
      steps: {},
      value,
      captureFidelity: "exact",
    };
    const observer = inspector.startFlow(definition, run)!;
    const probe = descriptorProbe(value);
    try {
      observer.update(run);
    } finally {
      probe.restore();
    }
    assert.ok(
      probe.count() <= 150,
      `${probe.count()} descriptor inspections for at most 150 retained fields`,
    );
    const captured = await flowHistory(inspector);
    assert.ok(captured.value && typeof captured.value === "object");
    assert.equal(Object.keys(captured.value).length, Math.min(150, width));
    assert.equal(captured.captureFidelity, width <= 150 ? "exact" : "modified");
  });
}

for (const hidden of [0, 10000]) {
  test(`request preflight ignores unused hidden fields: ${hidden}`, async (t) => {
    const inspector = createJevDevtools({ origin, enabled: true });
    t.after(() => inspector.dispose());
    const request = {
      state: [0.9],
      questions: { q: score("q", ["lo", "hi"]) },
    };
    for (let i = 0; i < hidden; i++)
      Object.defineProperty(request, `hidden${i}`, { value: i });
    let sent: unknown;
    const sdk = inspector.createClient({
      apiKey: "sample",
      logLevel: "off",
      compression: false,
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return Response.json({
          model: "sample",
          answers: { q: { type: "score", score: 0.9 } },
        });
      },
    });
    const probe = descriptorProbe(request);
    try {
      await sdk.systemOne(request);
    } finally {
      probe.restore();
    }
    assert.ok(
      probe.count() <= 260,
      `${probe.count()} descriptors exceed capped preflight plus four SDK fields`,
    );
    assert.ok(sent && typeof sent === "object" && "state" in sent);
    assert.deepEqual(sent.state, [0.9]);
    await nextTurn();
    await nextTurn();
    const [trace] = new TraceStore().apply(
      "snapshot",
      await event(inspector, "/api/jev-devtools/events"),
    );
    assert.equal(trace.captureFidelity?.request, "exact");
  });
  for (const path of ["direct", "merge"] as const) {
    test(`Flow snapshot descriptor work ignores hidden fields: ${path}/${hidden}`, async (t) => {
      const inspector = createJevDevtools({ origin, enabled: true });
      t.after(() => inspector.dispose());
      const value = [0.9];
      let hiddenReads = 0;
      for (let i = 0; i < hidden; i++)
        Object.defineProperty(value, `hidden${i}`, {
          get() {
            hiddenReads++;
            return i;
          },
        });
      const flow = defineJevFlow<{ value: number[]; flag: boolean }>(
        "bounded",
        (f) => {
          const selected =
            path === "direct"
              ? f.input.get("value")
              : f.if("pick", {
                  when: f.input.get("flag").eq(true),
                  then: (p) => p.input.get("value"),
                  else: (p) => p.input.get("value"),
                });
          return f.output("done", selected);
        },
      );
      const probe = descriptorProbe(value);
      try {
        assert.equal(
          (
            await flow.run(
              { value, flag: true },
              { client, devtools: inspector },
            )
          ).value,
          value,
        );
      } finally {
        probe.restore();
      }
      assert.ok(
        probe.count() <= 256 * (path === "direct" ? 1 : 2),
        `${probe.count()} descriptors exceed bounded snapshot preflight`,
      );
      assert.equal(hiddenReads, 0);
      const captured = await flowHistory(inspector);
      assert.deepEqual(captured.value, [0.9]);
      assert.equal(captured.captureFidelity, "exact");
    });
  }
}

// The cap must downgrade rather than falsely certify a snapshot whose later
// fields may contain accessors. Execution normalization still copies full JSON.
for (const snapshot of [jsonSnapshot, observerSnapshot]) {
  for (const shape of ["array", "object"]) {
    for (const width of [255, 256, 257]) {
      test(`snapshot preflight cap: ${snapshot.name}/${shape}/${width}`, () => {
        const value =
          shape === "array"
            ? Array(width).fill(1)
            : Object.fromEntries(
                Array.from({ length: width }, (_, i) => [`key${i}`, i]),
              );
        let uncertain = false;
        const probe = descriptorProbe(value);
        let copied;
        try {
          copied =
            snapshot === jsonSnapshot
              ? jsonSnapshot(value, new Set(), 0, () => {
                  uncertain = true;
                })
              : observerSnapshot(value, () => {
                  uncertain = true;
                });
        } finally {
          probe.restore();
        }
        assert.deepEqual(copied, value);
        assert.equal(uncertain, width > 256);
        assert.ok(probe.count() <= 256);
      });
    }
  }
}
