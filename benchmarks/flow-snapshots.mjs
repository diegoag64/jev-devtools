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
  "shared-12",
  "shared-16",
  "shared-19",
  "unique-2048",
  "map-cache",
];
const samplesPerProcess = 3;

async function worker(entry) {
  const { defineJevFlow } = await import(
    pathToFileURL(join(entry, "lib/flow/index.js"))
  );
  const { createJevDevtools } = await import(
    pathToFileURL(join(entry, "lib/server/index.js"))
  );
  const client = {
    systemOne() {
      throw new Error("Unexpected network request");
    },
  };
  const samples = [];
  for (const name of cases) {
    // One unmeasured warmup followed by measured runs; fresh inspector each time.
    for (let sample = -1; sample < samplesPerProcess; sample++) {
      let dataCaptures = 0;
      const inspector = createJevDevtools({
        origin: "http://localhost:5198",
        enabled: true,
        redact(path, value) {
          if (path.at(-1) === "data") dataCaptures++;
          return value;
        },
      });
      let input;
      if (name.startsWith("shared-")) {
        input = { value: 1 };
        for (let i = 0; i < Number(name.split("-")[1]); i++)
          input = { left: input, right: input };
      } else if (name === "unique-2048") {
        input = Array.from({ length: 2048 }, (_, id) => ({
          id,
          text: "x".repeat(128),
        }));
      }
      const flow = defineJevFlow(name, (f) => {
        if (name !== "map-cache") return f.output("done", f.input);
        const mapped = f.map(
          "items",
          {
            items: Array.from({ length: 32 }, (_, id) => ({
              id,
              text: "x".repeat(4000),
            })),
            input: null,
            concurrency: 4,
            maxItems: 32,
          },
          (item) =>
            item.task("work", { input: item.input.get("item"), run: (v) => v }),
        );
        for (let i = 0; i < 8; i++)
          f.task(`after-${i}`, { input: i, run: (v) => v });
        return f.output("done", mapped);
      });
      try {
        global.gc();
        const heapBefore = process.memoryUsage().heapUsed;
        const started = performance.now();
        const result = await flow.run(input, { client, devtools: inspector });
        const elapsedMs = performance.now() - started;
        // Allocation pressure at completion, not retained heap or peak memory.
        const heapDeltaMiB =
          (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2;
        assert.equal(result.outcome, "done");
        if (name === "map-cache") {
          assert.deepEqual(
            result.value,
            Array.from({ length: 32 }, (_, id) => ({
              id,
              text: "x".repeat(4000),
            })),
          );
          assert.equal(dataCaptures, 80);
        } else assert.equal(result.value, input);
        if (sample >= 0)
          samples.push({ name, sample, elapsedMs, heapDeltaMiB, dataCaptures });
      } finally {
        inspector.dispose();
      }
    }
  }
  return samples;
}

if (process.argv[2] === "--worker") {
  console.log(JSON.stringify(await worker(process.argv[3])));
} else {
  const ref = process.argv[2];
  if (!ref)
    throw new Error("Usage: node benchmarks/flow-snapshots.mjs BASE_REF");
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
    process.env.BENCH_OUTPUT ??
      `benchmarks/results/flow-snapshots-${Date.now()}`,
  );
  assert.ok(
    output.startsWith(join(root, "benchmarks/results") + sep),
    "Output must stay under ignored benchmarks/results/",
  );
  await mkdir(output, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), "jev-flow-snapshots-"));
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
            { cwd: root, encoding: "utf8" },
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
          dataCaptures: [...new Set(samples.map((s) => s.dataCaptures))],
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
        captures: s.dataCaptures.join(","),
      })),
    );
    console.log(`Report: ${join(output, "report.json")}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
