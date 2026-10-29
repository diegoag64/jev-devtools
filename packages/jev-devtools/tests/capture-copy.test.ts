import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Image, noul } from "@typesafe-ai/sdk";
import { createJevDevtools } from "jev-devtools/server";
import type { Json } from "jev-devtools";
import type { FlowRun } from "jev-devtools/flow";

const origin = "http://localhost:5196";
type Adapter = ReturnType<typeof createJevDevtools>;
async function snapshot(adapter: Adapter, path = "/flows/events") {
  const response = await adapter.handle(
    new Request(origin + "/api/jev-devtools" + path),
  );
  const reader = response.body!.getReader();
  try {
    return JSON.parse(
      new TextDecoder().decode((await reader.read()).value).split("data: ")[1],
    );
  } finally {
    await reader.cancel();
  }
}
function record(adapter: Adapter, value: Json) {
  const initial: FlowRun = {
    version: 1,
    id: "run",
    definitionId: "definition",
    name: "copy",
    startedAt: 0,
    status: "pending",
    steps: {},
  };
  adapter
    .startFlow(
      { version: 1, id: "definition", name: "copy", nodes: [] },
      initial,
    )!
    .update({ ...initial, status: "success", value });
}
function deepValue(levels = 4000) {
  let deep: Json = { leaf: "original" };
  for (let i = 0; i < levels; i++) deep = { next: deep };
  return { keep: "visible", deep };
}
const clientOptions = {
  apiKey: "sample",
  logLevel: "off" as const,
  fetch: async () =>
    Response.json({
      model: "fixture",
      answers: { ok: { type: "noul", noul: 0.8 } },
    }),
};

// Both public producers accept this JSON depth. The eager copy lost the entire
// capture before policy invocation, unlike the bounded projection on main.
for (const boundary of ["request", "outcome"] as const) {
  for (const policy of ["identity", "replace", "read-omission"] as const) {
    test(`${boundary} deep input preserves bounded capture and ${policy} policy behavior`, async (t) => {
      let roots = 0;
      const inspector = createJevDevtools({
        origin,
        enabled: true,
        redact: (path, value, context) => {
          if (context.kind !== boundary || path.length !== 0) return value;
          roots++;
          if (policy === "replace") return "replacement";
          if (policy === "read-omission") {
            let current = (
              boundary === "request"
                ? (value as { state: unknown }).state
                : value
            ) as { deep: any };
            let deep = current.deep;
            for (let i = 0; i < 4000; i++) deep = deep.next;
            return deep.leaf === "original" ? "replacement" : value;
          }
          return value;
        },
      });
      t.after(() => inspector.dispose());
      const input = deepValue();
      let value: any, warnings: string[];
      if (boundary === "request") {
        const client = inspector.createClient(clientOptions);
        assert.equal(
          (
            await client.systemOne({
              state: input,
              questions: { ok: noul("OK?") },
            })
          ).answers.ok.noul,
          0.8,
        );
        await nextTurn();
        const trace = (await snapshot(inspector, "/events")).traces[0];
        assert.equal(trace.status, "success");
        assert.equal(trace.captureFidelity.request, "modified");
        assert.equal(trace.captureFidelity.result, "unknown");
        warnings = trace.captureWarnings;
        value = trace.capture?.request ?? trace.request;
        if (policy === "identity") {
          assert.equal(trace.capture, undefined);
          assert.equal(typeof trace.request.model, "string");
          assert.equal(trace.request.questions.ok.type, "noul");
          value = trace.request.state;
        }
        if (policy === "read-omission")
          assert.equal(trace.capture.request, null);
      } else {
        record(inspector, input);
        const run = (await snapshot(inspector)).upserts[0];
        assert.equal(run.captureFidelity, "modified");
        value = run.value;
        warnings = run.captureWarnings;
        if (policy === "read-omission")
          assert.equal(value, "[capture unavailable]");
      }
      assert.equal(
        roots,
        1,
        "root policy executes before an oversized child can defeat capture",
      );
      assert.equal(input.keep, "visible");
      assert.ok(warnings.includes("Capture size/depth limit reached."));
      if (policy === "identity") {
        assert.equal(value.keep, "visible");
        let depth = 0,
          child = value.deep;
        while (child && typeof child === "object") {
          depth++;
          child = child.next;
        }
        assert.equal(child, "[truncated]");
        assert.ok(depth > 0 && depth <= 12);
      } else if (policy === "replace") assert.equal(value, "replacement");
      else
        assert.ok(warnings.includes("Capture policy accessed omitted data."));
    });
  }
}

for (const length of [149, 150, 151]) {
  test(`detached collection at ${length} keeps length, aliases, and mutation isolation`, async (t) => {
    let observedLength = 0;
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: (path, value, context) => {
        if (context.kind === "outcome" && path.length === 0) {
          const copy = value as {
            items: number[];
            same: number[];
            self: unknown;
          };
          observedLength = copy.items.length;
          assert.equal(copy.items, copy.same);
          assert.equal(copy.self, copy);
          if (copy.items.length <= 150) {
            const cloned = structuredClone(copy);
            assert.equal(cloned.self, cloned);
            assert.deepEqual(cloned.items, copy.items);
          }
          copy.items[0] = 77;
        }
        return value;
      },
    });
    t.after(() => inspector.dispose());
    const items = Array.from({ length }, (_, i) => i);
    const payload: { items: number[]; same: number[]; self?: Json } = {
      items,
      same: items,
    };
    payload.self = payload;
    record(inspector, payload);
    const run = (await snapshot(inspector)).upserts[0];
    assert.equal(observedLength, length);
    assert.equal(items[0], 0);
    assert.equal(run.value.items.length, Math.min(length, 150));
    assert.equal(run.value.items[0], 77);
    assert.equal(run.value.same, "[circular/repeated reference]");
    assert.equal(run.value.self, "[circular/repeated reference]");
    assert.equal(payload.self, payload);
    assert.deepEqual(
      run.captureWarnings,
      length > 150 ? ["Long collection truncated in capture."] : [],
    );
  });
}

test("policies cannot mistake omitted collection members for absent properties", async (t) => {
  const inspector = createJevDevtools({
    origin,
    enabled: true,
    redact: (path, value, context) => {
      if (context.kind === "outcome" && path.length === 0) {
        try {
          return (value as number[])[150] === undefined
            ? "unsafe fallback"
            : "replacement";
        } catch {
          return "unsafe fallback";
        }
      }
      return value;
    },
  });
  t.after(() => inspector.dispose());
  record(
    inspector,
    Array.from({ length: 151 }, (_, i) => i),
  );
  const run = (await snapshot(inspector)).upserts[0];
  assert.equal(run.value, "[capture unavailable]");
  assert.ok(
    run.captureWarnings.includes("Capture policy accessed omitted data."),
  );
});

for (const operation of ["set", "defineProperty"] as const) {
  for (const writable of [false, true]) {
    test(`${operation} only replaces omission guards after a successful write: ${writable}`, async (t) => {
      let succeeded: boolean | undefined;
      const inspector = createJevDevtools({
        origin,
        enabled: true,
        redact: (path, value, context) => {
          if (context.kind !== "outcome" || path.length !== 0) return value;
          const copy = value as Record<string, string>;
          if (!writable) Object.preventExtensions(copy);
          succeeded =
            operation === "set"
              ? Reflect.set(copy, "k150", "replacement")
              : Reflect.defineProperty(copy, "k150", {
                  value: "replacement",
                  enumerable: true,
                  configurable: true,
                  writable: true,
                });
          try {
            return copy.k150 === undefined ? "unsafe fallback" : copy.k150;
          } catch {
            // A policy cannot clear the sticky omission failure by catching it.
            return "unsafe fallback";
          }
        },
      });
      t.after(() => inspector.dispose());
      const source = Object.fromEntries(
        Array.from({ length: 151 }, (_, index) => [`k${index}`, "original"]),
      );
      record(inspector, source);
      const run = (await snapshot(inspector)).upserts[0];
      assert.equal(succeeded, writable);
      assert.equal(source.k150, "original");
      assert.equal(
        run.value,
        writable ? "replacement" : "[capture unavailable]",
      );
      assert.equal(
        run.captureWarnings.includes("Capture policy accessed omitted data."),
        !writable,
      );
    });
  }
}

test("copy work budget bounds composed shallow content before root replacement", async (t) => {
  let tailReads = 0,
    roots = 0;
  const rows = Array.from({ length: 150 }, () =>
    Object.fromEntries(Array.from({ length: 150 }, (_, i) => [String(i), i])),
  );
  Object.defineProperty(rows[149], "149", {
    enumerable: true,
    get() {
      tailReads++;
      return 149;
    },
  });
  const inspector = createJevDevtools({
    origin,
    enabled: true,
    redact: (path, value, context) => {
      if (context.kind === "outcome" && path.length === 0) {
        roots++;
        return "replacement";
      }
      return value;
    },
  });
  t.after(() => inspector.dispose());
  record(inspector, rows);
  const run = (await snapshot(inspector)).upserts[0];
  assert.equal(roots, 1);
  assert.equal(
    tailReads,
    0,
    "detachment must stop expanding after the composed budget",
  );
  assert.equal(run.value, "replacement");
  assert.ok(run.captureWarnings.includes("Capture size/depth limit reached."));
});

for (const size of [47999, 48000, 48001]) {
  test(`bounded Image copy retains reference and size at ${size} bytes`, async (t) => {
    const bytes = new Uint8Array(size);
    bytes.set([137, 80]);
    const photo = new Image(bytes);
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: (_path, value) => value,
    });
    t.after(() => inspector.dispose());
    const client = inspector.createClient(clientOptions);
    await client.systemOne({
      state: { photo },
      questions: { ok: noul("OK?") },
    });
    await nextTurn();
    const trace = (await snapshot(inspector, "/events")).traces[0];
    assert.equal(trace.request.state.photo.ref, String(photo));
    assert.equal(trace.request.state.photo.bytes, size);
    assert.equal(trace.captureFidelity.request, "modified");
    assert.equal(
      typeof trace.request.state.photo.preview,
      size < 48000 ? "string" : "undefined",
    );
    assert.equal(
      trace.captureWarnings.includes(
        "Image preview omitted (Blob, unsupported format, or size limit).",
      ),
      size >= 48000,
    );
  });
}

for (const depth of [11, 12, 13]) {
  test(`detached leaf at depth ${depth} agrees with stored capture limit`, async (t) => {
    const inspector = createJevDevtools({
      origin,
      enabled: true,
      redact: (_path, value) => value,
    });
    t.after(() => inspector.dispose());
    record(inspector, deepValue(depth - 2));
    const run = (await snapshot(inspector)).upserts[0];
    let leaf = run.value.deep;
    for (let i = 0; i < depth - 2; i++) leaf = leaf.next;
    assert.equal(leaf.leaf, depth <= 12 ? "original" : "[truncated]");
    assert.equal(run.captureFidelity, depth <= 12 ? "unknown" : "modified");
    assert.deepEqual(
      run.captureWarnings,
      depth <= 12 ? [] : ["Capture size/depth limit reached."],
    );
  });
}

test("policy reads of omitted Image bytes fail closed while SDK execution succeeds", async (t) => {
  const bytes = new Uint8Array(48000);
  bytes.set([137, 80]);
  const photo = new Image(bytes);
  const inspector = createJevDevtools({
    origin,
    enabled: true,
    redact: (_path, value) => {
      if (value instanceof Image)
        return value.data instanceof Uint8Array ? value.data[0] : null;
      return value;
    },
  });
  t.after(() => inspector.dispose());
  const client = inspector.createClient(clientOptions);
  assert.equal(
    (
      await client.systemOne({
        state: { photo },
        questions: { ok: noul("OK?") },
      })
    ).answers.ok.noul,
    0.8,
  );
  await nextTurn();
  const trace = (await snapshot(inspector, "/events")).traces[0];
  assert.equal(trace.capture.request, null);
  assert.ok(
    trace.captureWarnings.includes("Capture policy accessed omitted data."),
  );
  assert.equal(bytes[0], 137);
});
