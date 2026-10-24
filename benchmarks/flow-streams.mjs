import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const cases = [
  "no-readers",
  "fast-1",
  "fast-16-retained200",
  "slow-4-retained200",
];
const samplesPerProcess = 3;

async function worker(entry) {
  const { defineJevFlow } = await import(
    pathToFileURL(join(entry, "lib/flow/index.js"))
  );
  const { createJevDevtools } = await import(
    pathToFileURL(join(entry, "lib/server/index.js"))
  );
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const samples = [];
  const client = {
    systemOne() {
      throw new Error("Unexpected network request");
    },
  };
  for (const name of cases) {
    for (let sample = -1; sample < samplesPerProcess; sample++) {
      const readers =
        name === "no-readers"
          ? 0
          : name === "fast-1"
            ? 1
            : name.startsWith("slow")
              ? 4
              : 16;
      const retained = name.endsWith("retained200") ? 200 : 0;
      const inspector = createJevDevtools({
        origin: "http://localhost:5198",
        enabled: true,
        limit: 200,
      });
      const streams = [];
      const tasks = [];
      let bytes = 0,
        normalizedBytes = 0,
        messages = 0,
        definitions = 0;
      try {
        const flow = defineJevFlow("measured", (f) => {
          for (let i = 0; i < 24; i++) {
            f.task(`step-${i}`, {
              input: f.input,
              run: async (v) => {
                await tick();
                return v;
              },
            });
          }
          return f.output("done", f.input);
        });
        for (let i = 0; i < retained; i++) {
          await defineJevFlow(`seed-${i}`, (f) => f.output("seed", i)).run(
            null,
            { client, devtools: inspector },
          );
        }
        global.gc();
        const heapBefore = process.memoryUsage().heapUsed;
        const cpuBefore = process.cpuUsage();
        const started = performance.now();
        for (let i = 0; i < readers; i++) {
          const response = await inspector.handle(
            new Request("http://localhost:5198/api/jev-devtools/flows/events"),
          );
          const stream = response.body.getReader();
          streams.push(stream);
          tasks.push(
            (async () => {
              const known = new Map(),
                runs = new Map();
              for (;;) {
                // Deliberately lag in event-loop turns: exercise the real queue's
                // backpressure without a machine-dependent millisecond target.
                if (name.startsWith("slow"))
                  for (let delay = 0; delay < 8; delay++) await tick();
                const chunk = await stream.read();
                assert.equal(chunk.done, false);
                bytes += chunk.value.byteLength;
                const text = new TextDecoder().decode(chunk.value);
                const data = JSON.parse(text.split("data: ")[1].trim());
                messages++;
                definitions += data.definitions.length;
                normalizedBytes += Buffer.byteLength(
                  JSON.stringify(data, (key, value) =>
                    ["durationMs", "startedAt"].includes(key) ? 0 : value,
                  ),
                );
                for (const d of data.definitions) known.set(d.id, d);
                for (const r of data.upserts) {
                  assert.ok(
                    known.has(r.definitionId),
                    "run must have a delivered definition",
                  );
                  runs.set(r.id, r);
                }
                const current = data.order.map((id) => {
                  assert.ok(runs.has(id));
                  return runs.get(id);
                });
                const used = new Set(current.map((r) => r.definitionId));
                for (const id of known.keys())
                  if (!used.has(id)) known.delete(id);
                for (const id of runs.keys())
                  if (!data.order.includes(id)) runs.delete(id);
                const completed = current.find(
                  (r) => r.name === "measured" && r.status === "success",
                );
                if (completed) {
                  assert.deepEqual(completed.value, {
                    marker: "measured",
                    text: "x".repeat(256),
                  });
                  assert.equal(current.length, retained || 1);
                  return;
                }
              }
            })(),
          );
        }
        const result = await flow.run(
          { marker: "measured", text: "x".repeat(256) },
          { client, devtools: inspector },
        );
        const executionMs = performance.now() - started;
        await Promise.all(tasks);
        const elapsedMs = performance.now() - started;
        const cpu = process.cpuUsage(cpuBefore);
        const cpuMs = (cpu.user + cpu.system) / 1000;
        const heapDeltaMiB =
          (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2;
        assert.equal(result.outcome, "done");
        assert.deepEqual(result.value, {
          marker: "measured",
          text: "x".repeat(256),
        });
        assert.equal(
          definitions,
          readers * (retained + 1),
          "each definition is sent once per reader",
        );
        if (sample >= 0)
          samples.push({
            name,
            sample,
            readers,
            retained,
            executionMs,
            elapsedMs,
            cpuMs,
            heapDeltaMiB,
            bytes,
            normalizedBytes,
            messages,
            definitions,
          });
      } finally {
        inspector.dispose();
        await Promise.all(streams.map((r) => r.cancel()));
        await Promise.allSettled(tasks);
      }
    }
  }
  return samples;
}

if (process.argv[2] === "--worker") {
  console.log(JSON.stringify(await worker(process.argv[3])));
} else {
  const ref = process.argv[2];
  if (!ref) throw new Error("Usage: node benchmarks/flow-streams.mjs BASE_REF");
  const git = (args) => execFileSync("git", args, { cwd: root });
  const base = git(["rev-parse", "--verify", `${ref}^{commit}`])
    .toString()
    .trim();
  const head = git(["rev-parse", "HEAD"]).toString().trim();
  const patch = git(["diff", "HEAD", "--", "packages/jev-devtools"]);
  const rounds = Number(process.env.BENCH_ROUNDS ?? 5);
  assert.ok(Number.isSafeInteger(rounds) && rounds > 0 && rounds <= 20);
  const output = resolve(
    root,
    process.env.BENCH_OUTPUT ?? `benchmarks/results/flow-streams-${Date.now()}`,
  );
  assert.ok(
    output.startsWith(join(root, "benchmarks/results") + sep),
    "Output must stay under ignored benchmarks/results/",
  );
  await mkdir(output, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), "jev-flow-streams-"));
  try {
    const archive = git([
      "archive",
      base,
      "packages/jev-devtools",
      "tsconfig.base.json",
    ]);
    execFileSync("tar", ["-xf", "-", "-C", temp], { input: archive });
    await symlink(
      join(root, "node_modules"),
      join(temp, "node_modules"),
      "dir",
    );
    const entries = {
      baseline: join(temp, "packages/jev-devtools"),
      candidate: join(root, "packages/jev-devtools"),
    };
    for (const entry of Object.values(entries)) {
      execFileSync(
        process.execPath,
        [
          join(root, "node_modules/typescript/bin/tsc"),
          "-p",
          join(entry, "tsconfig.lib.json"),
        ],
        { cwd: root, stdio: "inherit" },
      );
    }
    const report = {
      base,
      head,
      dirty: !!git(["status", "--porcelain"]).toString().trim(),
      packageDiffSha256: createHash("sha256").update(patch).digest("hex"),
      benchmarkSha256: createHash("sha256")
        .update(readFileSync(import.meta.filename))
        .digest("hex"),
      node: process.version,
      platform: platform(),
      osRelease: release(),
      arch: arch(),
      cpu: cpus()[0].model,
      rounds,
      samplesPerProcess,
      warmupsPerCase: 1,
      method:
        "Sequential fresh worker processes; alternating variant order; explicit GC before each run. Completion heap delta is not peak or retained memory. Installed dependencies are shared; no network or live inference.",
      runs: [],
    };
    for (let round = 0; round < rounds; round++) {
      const order =
        round % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"];
      for (const variant of order) {
        const samples = JSON.parse(
          execFileSync(
            process.execPath,
            ["--expose-gc", import.meta.filename, "--worker", entries[variant]],
            { cwd: root, encoding: "utf8", timeout: 120_000 },
          ),
        );
        report.runs.push({ round, variant, samples });
        console.log(`Round ${round + 1}/${rounds}: ${variant} complete`);
      }
    }
    const stats = (values) => {
      const sorted = values.toSorted((a, b) => a - b);
      return {
        min: sorted[0],
        median: sorted[Math.floor(sorted.length / 2)],
        max: sorted.at(-1),
      };
    };
    report.summary = cases.flatMap((name) =>
      Object.keys(entries).map((variant) => {
        const samples = report.runs
          .filter((r) => r.variant === variant)
          .flatMap((r) => r.samples.filter((s) => s.name === name));
        return {
          name,
          variant,
          elapsedMs: stats(samples.map((s) => s.elapsedMs)),
          heapDeltaMiB: stats(samples.map((s) => s.heapDeltaMiB)),
          executionMs: stats(samples.map((s) => s.executionMs)),
          cpuMs: stats(samples.map((s) => s.cpuMs)),
          bytes: stats(samples.map((s) => s.bytes)),
          normalizedBytes: stats(samples.map((s) => s.normalizedBytes)),
          messages: [...new Set(samples.map((s) => s.messages))],
          definitions: [...new Set(samples.map((s) => s.definitions))],
        };
      }),
    );
    await writeFile(join(output, "candidate.patch"), patch);
    await writeFile(
      join(output, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.table(
      report.summary.map((s) => ({
        case: s.name,
        variant: s.variant,
        medianMs: s.elapsedMs.median.toFixed(3),
        minMs: s.elapsedMs.min.toFixed(3),
        maxMs: s.elapsedMs.max.toFixed(3),
        medianHeapMiB: s.heapDeltaMiB.median.toFixed(3),
        cpuMs: s.cpuMs.median.toFixed(3),
        bytes: s.bytes.median,
        messages: s.messages.join(","),
        definitions: s.definitions.join(","),
      })),
    );
    console.log(`Report: ${join(output, "report.json")}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
