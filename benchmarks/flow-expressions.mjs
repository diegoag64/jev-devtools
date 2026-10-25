// Local diagnostics only: no timing thresholds, network requests, or live inference.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { arch, cpus, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cases = ["branch", "reused", "tasks", "sample-sdk"];
const phases = ["construct", "run", "record"];
const warmups = 2;
const measured = 5;
const iterations = (name, phase) =>
  phase === "construct"
    ? 2000
    : phase === "record"
      ? 200
      : name === "sample-sdk"
        ? 500
        : 2000;
const stats = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const quantile = (p) => {
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    return (
      sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low)
    );
  };
  return {
    min: sorted[0],
    q1: quantile(0.25),
    median: quantile(0.5),
    q3: quantile(0.75),
    max: sorted.at(-1),
  };
};

async function worker() {
  // This script is copied into each isolated install, so public imports resolve
  // that revision's package and its own locked dependencies.
  const { defineJevFlow, all, any, not } = await import("jev-devtools/flow");
  const { createJevDevtools } = await import("jev-devtools/server");
  const { TypeSafeClient, noul } = await import("@typesafe-ai/sdk");
  const input = [
    { score: 0.8, blocked: false, override: false },
    { score: 0.2, blocked: false, override: false },
  ];
  const questions = {
    quality: { quality: noul("Quality?") },
    risk: { risk: noul("Risk?") },
  };
  const clientOptions = {
    apiKey: "sample-only",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init.body));
      return Response.json({
        model: "sample",
        answers: Object.fromEntries(
          Object.keys(request.questions).map((key) => [
            key,
            {
              type: "noul",
              noul: key === "quality" ? request.state.score : 0.1,
            },
          ]),
        ),
      });
    },
  };
  function build(name) {
    return defineJevFlow(name, (f) => {
      let value = f.input.get("score");
      let gate;
      if (name === "tasks") {
        for (let i = 0; i < 6; i++)
          value = f.task(`task-${i}`, {
            input: { value, offsets: [1] },
            run: (v) => v.value + v.offsets[0],
          });
        gate = all(value.gte(6.7), not(f.input.get("blocked")));
      } else if (name === "sample-sdk") {
        const quality = f.jev("quality", {
          state: f.input,
          questions: questions.quality,
        });
        const risk = f.jev("risk", {
          state: { score: value, quality: quality.answer("quality").noul },
          questions: questions.risk,
        });
        gate = all(
          quality.answer("quality").noul.gte(0.7),
          risk.answer("risk").noul.lt(0.2),
        );
      } else {
        gate = all(value.gte(0.7), not(f.input.get("blocked")));
        if (name === "reused")
          gate = any(gate, all(gate, f.input.get("override")));
      }
      return f.branch("decision", {
        when: gate,
        then: (p) => p.output("approve", f.input.get("score")),
        else: (p) => p.output("review", f.input.get("score")),
      });
    });
  }
  const samples = [];
  for (const name of cases) {
    for (const phase of phases) {
      let captures = 0;
      const inspector =
        phase === "record"
          ? createJevDevtools({
              enabled: true,
              origin: "http://localhost:5198",
              limit: 50,
              redact(_path, value) {
                captures++;
                return value;
              },
            })
          : undefined;
      const client =
        name === "sample-sdk"
          ? inspector
            ? inspector.createClient(clientOptions, { source: "sample" })
            : new TypeSafeClient(clientOptions)
          : {
              systemOne() {
                throw new Error("Unexpected SDK request");
              },
            };
      const options = { client, ...(inspector ? { devtools: inspector } : {}) };
      const flow = build(name);
      const count = iterations(name, phase);
      // Independent expected routes/values, including both sides of each branch.
      for (let i = 0; i < input.length; i++) {
        const result = await flow.run(input[i], options);
        assert.equal(result.outcome, i ? "review" : "approve");
        assert.equal(result.value, input[i].score);
      }
      try {
        for (let sample = -warmups; sample < measured; sample++) {
          global.gc();
          let checksum = 0,
            failures = 0;
          const cpuBefore = process.cpuUsage();
          const start = performance.now();
          if (phase === "construct") {
            for (let i = 0; i < count; i++)
              checksum += build(name).definition.nodes.length;
          } else {
            for (let i = 0; i < count; i++) {
              const result = await flow.run(input[i % 2], options);
              checksum += result.value;
              failures += Number(
                result.outcome !== (i % 2 ? "review" : "approve"),
              );
            }
          }
          const wallUs = ((performance.now() - start) * 1000) / count;
          const cpu = process.cpuUsage(cpuBefore);
          const cpuUs = (cpu.user + cpu.system) / count;
          assert.equal(failures, 0);
          assert.ok(
            Math.abs(
              checksum -
                count *
                  (phase === "construct" ? flow.definition.nodes.length : 0.5),
            ) < 1e-6,
          );
          if (inspector)
            assert.ok(captures > 0, "Real recorder must process captures");
          if (sample >= 0)
            samples.push({
              name,
              phase,
              sample,
              iterations: count,
              definitionNodes: flow.definition.nodes.length,
              wallUs,
              cpuUs,
            });
        }
      } finally {
        inspector?.dispose();
      }
    }
  }
  return samples;
}

if (process.argv[2] === "--worker") {
  console.log(JSON.stringify(await worker()));
} else {
  const ref = process.argv[2];
  assert.ok(
    ref,
    "Usage: node benchmarks/flow-expressions.mjs BASE_REF [CANDIDATE_REF]",
  );
  const git = (args) => execFileSync("git", args, { cwd: root });
  const revision = (ref) =>
    git(["rev-parse", "--verify", `${ref}^{commit}`])
      .toString()
      .trim();
  const refs = {
    baseline: revision(ref),
    candidate: revision(process.argv[3] ?? "HEAD"),
  };
  const rounds = Number(process.env.BENCH_ROUNDS ?? 8);
  assert.ok(Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 20);
  const output = resolve(
    root,
    process.env.BENCH_OUTPUT ??
      `benchmarks/results/flow-expressions-${Date.now()}`,
  );
  assert.ok(
    output.startsWith(join(root, "benchmarks/results") + sep),
    "Output must stay under ignored benchmarks/results/",
  );
  await mkdir(output, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), "jev-expression-bench-"));
  // Keep npm and child commands on the same supported Node even outside the repo.
  const env = {
    ...process.env,
    PATH: dirname(process.execPath) + ":" + process.env.PATH,
  };
  const report = {
    refs,
    benchmarkSha256: createHash("sha256")
      .update(readFileSync(import.meta.filename))
      .digest("hex"),
    node: process.version,
    platform: platform(),
    osRelease: release(),
    arch: arch(),
    cpu: cpus()[0].model,
    rounds,
    samplesPerProcess: measured,
    warmupBatches: warmups,
    method:
      "Committed revisions only; separate locked installs/builds; sequential fresh processes in alternating variant order. Explicit GC outside timed batches; synchronous construction measured separately from awaited runs. Real recorder retains 50 runs; no readers. SDK fetch is an immediate local sample response. Wall and process CPU microseconds per definition/run; no inference, network latency, browser, cold-start or memory measurements.",
    runs: [],
  };
  try {
    for (const [variant, sha] of Object.entries(refs)) {
      const dir = join(temp, variant);
      await mkdir(dir);
      const archive = join(temp, `${variant}.tar`);
      git(["archive", "--output", archive, sha]);
      execFileSync("tar", ["-xf", archive, "-C", dir]);
      // No shared writable node_modules or output directories between revisions.
      for (const args of [
        ["ci", "--no-audit", "--no-fund"],
        ["run", "build:package"],
      ]) {
        const log = execFileSync("npm", args, {
          cwd: dir,
          env,
          encoding: "utf8",
        });
        await writeFile(join(output, `${variant}-${args[0]}.log`), log);
      }
      await copyFile(
        import.meta.filename,
        join(dir, "benchmarks/flow-expressions.mjs"),
      );
      report[`${variant}LockSha256`] = createHash("sha256")
        .update(readFileSync(join(dir, "package-lock.json")))
        .digest("hex");
      report[`${variant}FlowSha256`] = createHash("sha256")
        .update(readFileSync(join(dir, "packages/jev-devtools/flow/index.ts")))
        .digest("hex");
    }
    for (let round = 0; round < rounds; round++) {
      for (const variant of round % 2
        ? ["candidate", "baseline"]
        : ["baseline", "candidate"]) {
        const dir = join(temp, variant);
        const samples = JSON.parse(
          execFileSync(
            process.execPath,
            [
              "--expose-gc",
              join(dir, "benchmarks/flow-expressions.mjs"),
              "--worker",
            ],
            { cwd: dir, env, encoding: "utf8", timeout: 300_000 },
          ),
        );
        report.runs.push({ round, variant, samples });
        await writeFile(
          join(output, "report.json"),
          JSON.stringify(report, null, 2) + "\n",
        );
        console.log(`Round ${round + 1}/${rounds}: ${variant} complete`);
      }
    }
    report.summary = cases.flatMap((name) =>
      phases.map((phase) => {
        const perProcess = (variant) =>
          report.runs
            .filter((r) => r.variant === variant)
            .map((r) => ({
              round: r.round,
              wall: stats(
                r.samples
                  .filter((s) => s.name === name && s.phase === phase)
                  .map((s) => s.wallUs),
              ).median,
              cpu: stats(
                r.samples
                  .filter((s) => s.name === name && s.phase === phase)
                  .map((s) => s.cpuUs),
              ).median,
            }));
        const baseline = perProcess("baseline"),
          candidate = perProcess("candidate");
        return {
          name,
          phase,
          iterations: iterations(name, phase),
          baselineUs: stats(baseline.map((s) => s.wall)),
          candidateUs: stats(candidate.map((s) => s.wall)),
          baselineCpuUs: stats(baseline.map((s) => s.cpu)),
          candidateCpuUs: stats(candidate.map((s) => s.cpu)),
          pairedChangePercent: stats(
            candidate.map((s, i) => (s.wall / baseline[i].wall - 1) * 100),
          ),
        };
      }),
    );
    await writeFile(
      join(output, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.table(
      report.summary.map((s) => ({
        case: s.name,
        phase: s.phase,
        baselineUs: s.baselineUs.median.toFixed(2),
        candidateUs: s.candidateUs.median.toFixed(2),
        pairedPercent: s.pairedChangePercent.median.toFixed(1),
        pairedRange: `${s.pairedChangePercent.min.toFixed(1)} to ${s.pairedChangePercent.max.toFixed(1)}`,
      })),
    );
    console.log(`Report: ${join(output, "report.json")}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
