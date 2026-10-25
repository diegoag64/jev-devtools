// Local only: build first, then run with --expose-gc. No live inference.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { resolve, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { defineJevFlow } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";

assert.equal(typeof global.gc, "function", "Run with --expose-gc");
const root = resolve(import.meta.dirname, "..");
const output = resolve(
  root,
  process.env.BENCH_OUTPUT ?? "benchmarks/results/flow-transport",
);
assert.ok(output.startsWith(join(root, "benchmarks/results") + sep));
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
assert.ok(Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 20);
const cases = ["disabled", "no-readers", "fast-1", "stalled-1", "fast-3"];
const selected = process.env.BENCH_CASE ? [process.env.BENCH_CASE] : cases;
assert.ok(selected.every((name) => cases.includes(name)));
const origin = "http://localhost:5198";
const client = {
  systemOne() {
    throw new Error("Unexpected SDK request");
  },
};
const flow = defineJevFlow("transport-map", (f) => {
  const items = f.map(
    "items",
    {
      items: Array.from({ length: 64 }, (_, i) => i),
      input: null,
      maxItems: 64,
      concurrency: 4,
    },
    (item) =>
      item.task("work", {
        input: item.input.get("item"),
        run: async (index) => {
          await delay(3 + (index % 4));
          return "x".repeat(16000);
        },
      }),
  );
  return f.output("done", items);
});
async function measure(name) {
  const inspector = createJevDevtools({ origin, enabled: name !== "disabled" });
  const streams = [];
  const count =
    name === "fast-3" ? 3 : ["fast-1", "stalled-1"].includes(name) ? 1 : 0;
  const decoder = new TextDecoder();
  async function drain(reader) {
    let bytes = 0,
      messages = 0;
    const definitions = new Map(),
      runs = new Map();
    for (;;) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false, "Stream ended before final state");
      bytes += chunk.value.byteLength;
      const text = decoder.decode(chunk.value);
      if (!text.startsWith("event: flows\n")) continue;
      messages++;
      const update = JSON.parse(text.split("data: ")[1]);
      for (const d of update.definitions) definitions.set(d.id, d);
      for (const r of update.upserts) runs.set(r.id, r);
      const current = update.order.map((id) => {
        assert.ok(runs.has(id));
        const run = runs.get(id);
        assert.ok(definitions.has(run.definitionId));
        return run;
      });
      const used = new Set(current.map((r) => r.definitionId));
      for (const id of definitions.keys())
        if (!used.has(id)) definitions.delete(id);
      for (const id of runs.keys())
        if (!update.order.includes(id)) runs.delete(id);
      const final = current.find((r) => r.status === "success");
      if (final) {
        assert.equal(current.length, 1);
        assert.equal(final.steps.items.collection.items.length, 64);
        for (const item of final.steps.items.collection.items) {
          assert.equal(item.run.status, "success");
          assert.equal(item.run.steps.work.data.output, "x".repeat(16000));
        }
        const finalBytes = Buffer.byteLength(JSON.stringify(final));
        return {
          bytes,
          messages,
          finalBytes,
          amplification: bytes / finalBytes,
          finalWarnings: final.captureWarnings,
        };
      }
    }
  }
  let pending = [];
  try {
    for (let i = 0; i < count; i++) {
      const response = await inspector.handle(
        new Request(origin + "/api/jev-devtools/flows/events"),
      );
      streams.push(response.body.getReader());
    }
    global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage(),
      started = performance.now();
    if (name !== "stalled-1") pending = streams.map(drain);
    const result = await flow.run(null, { client, devtools: inspector });
    const executionMs = performance.now() - started;
    if (name === "stalled-1") pending = streams.map(drain);
    const readers = await Promise.all(pending);
    const elapsedMs = performance.now() - started,
      cpu = process.cpuUsage(cpuBefore);
    const completionHeapDeltaMiB =
      (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2;
    assert.deepEqual(result.value, Array(64).fill("x".repeat(16000)));
    global.gc();
    const retainedHeapDeltaMiB =
      (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2;
    return {
      name,
      executionMs,
      elapsedMs,
      cpuMs: (cpu.user + cpu.system) / 1000,
      completionHeapDeltaMiB,
      retainedHeapDeltaMiB,
      readers,
    };
  } finally {
    inspector.dispose();
    await Promise.all(streams.map((r) => r.cancel()));
    await Promise.allSettled(pending);
  }
}
await mkdir(output, { recursive: true });
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const report = {
  revision: git("rev-parse", "HEAD"),
  dirty: !!git("status", "--porcelain"),
  packageDiffSha256: createHash("sha256")
    .update(git("diff", "HEAD", "--", "packages/jev-devtools"))
    .digest("hex"),
  benchmarkSha256: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  node: process.version,
  cpu: cpus()[0].model,
  platform: platform(),
  osRelease: release(),
  method:
    "One warmup per case; sequential cases with reversed order on alternate rounds. Public exports from this checkout's build. Wall/process CPU includes same-process decoding/validation. GC outside timing. Retained heap delta keeps adapter/history alive; not peak memory or a leak test. No network or inference.",
  samples: [],
};
for (const name of selected) await measure(name);
for (let round = 0; round < rounds; round++) {
  for (const name of round % 2 ? [...selected].reverse() : selected) {
    const sample = { round, ...(await measure(name)) };
    report.samples.push(sample);
    console.log(JSON.stringify(sample));
  }
}
await writeFile(
  join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
