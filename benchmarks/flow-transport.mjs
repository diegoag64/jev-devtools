// Local only: build first, then run with --expose-gc. No live inference.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
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
const cases = [
  "disabled",
  "observer",
  "no-readers",
  "fast-1",
  "stalled-1",
  "fast-3",
];
const selected = process.env.BENCH_CASE ? [process.env.BENCH_CASE] : cases;
assert.ok(selected.every((name) => cases.includes(name)));
const origin = "http://localhost:5198";
const flowCaptureBytes =
  process.env.BENCH_CAPTURE_BYTES === undefined
    ? undefined
    : Number(process.env.BENCH_CAPTURE_BYTES);
assert.ok(
  flowCaptureBytes === undefined ||
    (Number.isSafeInteger(flowCaptureBytes) && flowCaptureBytes >= 0),
);
const workload = process.env.BENCH_WORKLOAD ?? "map";
assert.ok(["map", "nested-history"].includes(workload));
// Resource sampling is a separate diagnostic, not part of timing comparisons.
const resources = process.env.BENCH_RESOURCES === "1";
if (resources) assert.ok(rounds === 1 && selected.length === 1);
const client = {
  systemOne() {
    throw new Error("Unexpected SDK request");
  },
};
const mapFlow = defineJevFlow("transport-map", (f) => {
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
const nestedFlow = defineJevFlow("transport-nested", (f) => {
  const rounds = f.loop(
    "rounds",
    {
      initial: 0,
      input: f.input,
      maxIterations: 2,
      while: (state) => state.lt(2),
    },
    (round) => {
      round.map(
        "batch",
        {
          items: Array.from({ length: 8 }, (_, i) => i),
          input: round.input.get("context"),
          maxItems: 8,
          concurrency: 2,
        },
        (item) =>
          item.task("work", {
            input: item.input,
            run: async ({ item: index, context }) => {
              if (!context.seed) await delay(3 + (index % 4));
              return "n".repeat(4000);
            },
          }),
      );
      return round.task("advance", {
        input: round.input.get("state"),
        run: (n) => n + 1,
      });
    },
  );
  return f.output("done", rounds);
});
const flow = workload === "map" ? mapFlow : nestedFlow;
function validateFinal(final) {
  assert.equal(final.status, "success");
  let capturedBytes = 0,
    omittedValues = 0;
  const count = (run) => {
    if (run.value !== undefined)
      capturedBytes += Buffer.byteLength(JSON.stringify(run.value));
    if (run.valueOmitted) {
      assert.notEqual(flowCaptureBytes, undefined);
      assert.equal(run.valueOmitted, "budget");
      assert.equal(run.value, undefined);
      assert.ok(
        run.captureWarnings.includes(
          "Outcome value omitted by flow capture byte budget.",
        ),
      );
      omittedValues++;
    }
    for (const step of Object.values(run.steps)) {
      if (step.data !== undefined)
        capturedBytes += Buffer.byteLength(JSON.stringify(step.data));
      if (step.dataOmitted) {
        assert.notEqual(flowCaptureBytes, undefined);
        assert.equal(step.dataOmitted, "budget");
        assert.equal(step.data, undefined);
        assert.ok(
          step.captureWarnings.includes(
            "Step data omitted by flow capture byte budget.",
          ),
        );
        omittedValues++;
      }
      for (const item of step.collection?.items ?? [])
        if (item.run) count(item.run);
    }
  };
  count(final);
  if (flowCaptureBytes !== undefined)
    assert.ok(capturedBytes <= flowCaptureBytes);
  const batches =
    workload === "map"
      ? [final.steps.items.collection]
      : final.steps.rounds.collection.items.map((round) => {
          assert.equal(round.run.status, "success");
          return round.run.steps.batch.collection;
        });
  assert.equal(batches.length, workload === "map" ? 1 : 2);
  for (const batch of batches) {
    assert.equal(batch.items.length, workload === "map" ? 64 : 8);
    for (const item of batch.items) {
      assert.equal(item.run.status, "success");
      if (item.run.steps.work.dataOmitted === "budget") continue;
      assert.equal(
        item.run.steps.work.data.output,
        workload === "map" ? "x".repeat(16000) : "n".repeat(4000),
      );
    }
  }
  return { capturedBytes, omittedValues };
}
async function measure(name) {
  const inspector = createJevDevtools({
    origin,
    enabled: name !== "disabled",
    flowCaptureBytes,
  });
  const seeded = new Set();
  let observerUpdates = 0;
  const observer = {
    startFlow() {
      return {
        update() {
          observerUpdates++;
        },
        request(_link, _trace, callback) {
          return callback();
        },
      };
    },
  };
  const devtools = name === "observer" ? observer : inspector;
  if (workload === "nested-history") {
    for (let i = 0; i < 12; i++) {
      const result = await flow.run({ seed: true }, { client, devtools });
      assert.equal(result.value, 2);
      seeded.add(result.runId);
    }
  }
  const streams = [];
  const count =
    name === "fast-3" ? 3 : ["fast-1", "stalled-1"].includes(name) ? 1 : 0;
  const decoder = new TextDecoder();
  async function drain(reader) {
    let bytes = 0,
      messages = 0,
      clientMs = 0,
      initialBytes = 0,
      initialClientMs = 0;
    const definitions = new Map(),
      runs = new Map();
    for (;;) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false, "Stream ended before final state");
      bytes += chunk.value.byteLength;
      const clientStarted = performance.now();
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
      const clientElapsed = performance.now() - clientStarted;
      clientMs += clientElapsed;
      if (messages === 1) {
        initialBytes = chunk.value.byteLength;
        initialClientMs = clientElapsed;
      }
      const final = current.find(
        (r) => r.status === "success" && !seeded.has(r.id),
      );
      if (final) {
        assert.equal(current.length, seeded.size + 1);
        for (const run of current) validateFinal(run);
        const finalBytes = Buffer.byteLength(JSON.stringify(final));
        return {
          bytes,
          messages,
          finalBytes,
          amplification: bytes / finalBytes,
          clientMs,
          initialBytes,
          initialClientMs,
          finalWarnings: final.captureWarnings,
          capture: validateFinal(final),
        };
      }
    }
  }
  let pending = [];
  let sampler;
  try {
    global.gc();
    const beforeConnect = process.memoryUsage();
    let sampledHeapMax = beforeConnect.heapUsed,
      sampledRssMax = beforeConnect.rss;
    if (resources)
      sampler = setInterval(() => {
        const memory = process.memoryUsage();
        sampledHeapMax = Math.max(sampledHeapMax, memory.heapUsed);
        sampledRssMax = Math.max(sampledRssMax, memory.rss);
      }, 1);
    const connectionStarted = performance.now();
    for (let i = 0; i < count; i++) {
      const response = await inspector.handle(
        new Request(origin + "/api/jev-devtools/flows/events"),
      );
      streams.push(response.body.getReader());
    }
    const connectionMs = performance.now() - connectionStarted;
    global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage(),
      started = performance.now();
    if (name !== "stalled-1") pending = streams.map(drain);
    let result = await flow.run(workload === "map" ? null : { seed: false }, {
      client,
      devtools,
    });
    const executionMs = performance.now() - started;
    if (name === "stalled-1") pending = streams.map(drain);
    const readers = await Promise.all(pending);
    const elapsedMs = performance.now() - started,
      cpu = process.cpuUsage(cpuBefore);
    const completionHeapDeltaMiB =
      (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2;
    assert.deepEqual(
      result.value,
      workload === "map" ? Array(64).fill("x".repeat(16000)) : 2,
    );
    const completedId = result.runId;
    result = null;
    clearInterval(sampler);
    const completionMemory = process.memoryUsage();
    sampledHeapMax = Math.max(sampledHeapMax, completionMemory.heapUsed);
    sampledRssMax = Math.max(sampledRssMax, completionMemory.rss);
    global.gc();
    const retainedHeapDeltaMiB =
      (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2;
    // Initial/reconnect full snapshots are measured separately from execution.
    let reconnect;
    if (count) {
      const started = performance.now();
      const response = await inspector.handle(
        new Request(origin + "/api/jev-devtools/flows/events"),
      );
      const reader = response.body.getReader();
      const chunk = await reader.read();
      const serverMs = performance.now() - started;
      const parseStarted = performance.now();
      const update = JSON.parse(decoder.decode(chunk.value).split("data: ")[1]);
      const parseMs = performance.now() - parseStarted;
      assert.equal(update.upserts.length, seeded.size + 1);
      assert.equal(update.upserts[0].id, completedId);
      for (const run of update.upserts) validateFinal(run);
      reconnect = { serverMs, parseMs, bytes: chunk.value.byteLength };
      await reader.cancel();
    }
    let memory;
    if (resources) {
      await Promise.all(streams.map((reader) => reader.cancel()));
      global.gc();
      const retained = process.memoryUsage();
      await inspector.handle(
        new Request(origin + "/api/jev-devtools/clear", {
          method: "DELETE",
          headers: { origin },
        }),
      );
      await new Promise(setImmediate);
      global.gc();
      memory = {
        beforeConnect,
        completionMemory,
        sampledHeapMax,
        sampledRssMax,
        retainedWithHistory: retained,
        afterClear: process.memoryUsage(),
        maxRssKiB: process.resourceUsage().maxRSS,
      };
    }
    return {
      name,
      connectionMs,
      deliveryLagMs: elapsedMs - executionMs,
      observerUpdates,
      executionMs,
      elapsedMs,
      cpuMs: (cpu.user + cpu.system) / 1000,
      completionHeapDeltaMiB,
      retainedHeapDeltaMiB,
      readers,
      reconnect,
      memory,
    };
  } finally {
    clearInterval(sampler);
    inspector.dispose();
    await Promise.all(streams.map((r) => r.cancel()));
    await Promise.allSettled(pending);
  }
}
await mkdir(output, { recursive: true });
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const archiveRevision = process.env.BENCH_ARCHIVE_REVISION;
if (archiveRevision) assert.match(archiveRevision, /^[a-f0-9]{40}$/);
else
  assert.equal(
    git("rev-parse", "--show-toplevel"),
    root,
    "Set BENCH_ARCHIVE_REVISION for an archived baseline",
  );
const sourceHash = createHash("sha256");
for (const directory of ["flow", "server", "src"]) {
  const base = join(root, "packages/jev-devtools", directory);
  for (const file of (await readdir(base, { recursive: true })).sort()) {
    if (!/\.tsx?$/.test(file)) continue;
    sourceHash
      .update(directory + "/" + file)
      .update(await readFile(join(base, file)));
  }
}
const report = {
  revision: archiveRevision ?? git("rev-parse", "HEAD"),
  archive: !!archiveRevision,
  dirty: archiveRevision ? undefined : !!git("status", "--porcelain"),
  packageSourceSha256: sourceHash.digest("hex"),
  benchmarkSha256: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  node: process.version,
  cpu: cpus()[0].model,
  platform: platform(),
  osRelease: release(),
  workload,
  capturePolicy: { flowCaptureBytes: flowCaptureBytes ?? null },
  resources,
  method:
    "One warmup per timing case; sequential cases reversed on alternate rounds. Resource diagnostic has no warmup and one case/round, 1ms memory sampling (lower bound on peak), process maxRSS, and post-GC history/clear checkpoints; not a leak test. Public exports; no network/inference. Execution timings exclude history seeding, connection encoding and reconnect. Client time includes decode/JSON parse and map reconstruction but not browser validation/rendering. Completion heap is allocation pressure. Observer case projects snapshots without recorder storage.",
  samples: [],
};
if (!resources) for (const name of selected) await measure(name);
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
