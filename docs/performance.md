# Local performance benchmarks

Keep benchmark scripts and fixtures in Git so comparisons remain reproducible. Keep generated measurements, profiles, screenshots, logs, and per-run reports **out of Git**, under ignored `benchmarks/results/`. Do not copy results into `docs/` or force-add ignored artifacts. Summarize findings in the relevant PR description or discussion.

Performance benchmarks run locally only. Do not add or dispatch GitHub Actions benchmark jobs. Correctness and integration checks may run in CI.

## Run locally

Use Node 22.12+ (24 recommended). Install dependencies with `npm ci`. All workloads use deterministic samples; no API key or paid inference is required.

```sh
# Run separately, with no competing builds or benchmark processes.
npm run bench:server
npm run bench:browser
```

The server suite writes `benchmarks/results/server.json`. The browser command builds production React and serves a manual harness at http://127.0.0.1:4190/ (`BENCH_PORT` overrides the port). Wait for “Ready,” then run suites sequentially in one foreground browser tab. Results save as timestamped JSON and `browser.json` under `benchmarks/results/`. Restart the server after source changes; this is not HMR.

`BENCH_LIVE=1 npm run bench:browser` exercises the real adapter with local sample responses. Without it, the harness replays captured snapshots. “Live” here does not mean live inference.

For a before/after comparison in fresh isolated Chromium processes:

```sh
npx playwright install chromium --only-shell
BENCH_OUTPUT=benchmarks/results/my-comparison \
  npm run bench:compare -- BASE_COMMIT
```

Replace `BASE_COMMIT` with the baseline's commit SHA. The command builds the archived baseline and current working tree, runs timing and profiling separately, and stops its own browsers and servers afterward. `BENCH_ROUNDS` controls timing rounds (default four); `BENCH_BASE_PORT` controls loopback ports (default 4211 onward). `BENCH_DRAWER_MODES=open,closed,unopened` includes hidden-drawer workloads. Use a unique ignored output directory for each experiment; repeated output paths can overwrite previous measurements.

For Choice diagram comparisons (small control, 150 categories, and combined stress):

```sh
BENCH_SUITE=choices BENCH_OUTPUT=benchmarks/results/choice-comparison \
  npm run bench:compare -- BASE_COMMIT
```

This measures warmed mounts and the same native pan/wheel/Fit sequence in each revision, with separate profiling runs. It records scene size and whether Fit contains it.

For unchanged-row/detail comparisons while requests arrive:

```sh
BENCH_SUITE=rerenders BENCH_OUTPUT=benchmarks/results/rerenders-comparison \
  npm run bench:compare -- BASE_COMMIT
```

This sends 20 deterministic sample calls at a target 10 calls/sec per case through the real adapter. It compares an older pinned request in Flow/Raw with following the latest request, using 1/200 retained requests and the combined large-state/Choice workload. It checks that the selected request stays pinned and the latest completed response remains accessible. Production timing and React/CPU profiling run separately; outputs remain local.

## Flow snapshot comparison

To compare observer snapshot cost against a Git revision:

```sh
BENCH_OUTPUT=benchmarks/results/flow-snapshots-comparison \
  node benchmarks/flow-snapshots.mjs BASE_COMMIT
```

The command builds the archived baseline and current package with the installed dependencies, then runs them sequentially in fresh Node processes with alternating variant order. The default five rounds each have one warmup and three measured runs per case; `BENCH_ROUNDS` accepts 1–20. Keep competing builds and benchmarks stopped.

Cases include shared-reference graphs with 13, 17, and 20 distinct objects, an array of 2,048 distinct records, and 32 map tasks followed by eight unrelated task updates. The real recorder runs in every case. Assertions check returned values and unchanged task-data capture counts. No network calls or inference occur.

The report records revisions, the candidate source patch, environment, raw samples, elapsed time, completion heap delta, and capture counts. The heap delta measures allocation pressure at completion after a pre-run GC; it is neither peak nor retained memory. Results stay under ignored `benchmarks/results/`. This suite has no timing thresholds and does not run in CI.

## Flow stream comparison

```sh
BENCH_OUTPUT=benchmarks/results/flow-streams-comparison \
  node benchmarks/flow-streams.mjs BASE_COMMIT
```

This local-only comparison uses the real flow SSE endpoint with no network or inference calls. A 24-task flow runs with no readers, one fast reader, 16 fast readers with 200 retained definitions/runs, and four slow readers with the same retained history. Slow readers wait eight event-loop turns between reads to exercise backpressure; this is a synthetic consumption pattern, not a network bandwidth simulation. Each reader checks definition availability and the complete final result. Definitions must be delivered exactly once per reader in these workloads.

Like the snapshot comparison, it builds the archived baseline and current package with shared installed dependencies and runs sequential fresh processes in alternating order: five rounds by default, one warmup and three measured samples per case/process. `BENCH_ROUNDS` accepts 1–20. Run without competing builds or benchmarks.

The ignored report includes source provenance, raw samples, time through final delivery, time through flow completion (including connection setup), process CPU time, completion heap delta, raw SSE bytes, message counts, and definition counts. A separate normalized payload-byte count replaces timestamps/durations with zero to distinguish content changes from timing-dependent serialization. Heap deltas are allocation pressure, not peak or retained memory. Initial snapshots are included in measurements; seeding retained history is excluded. No timing thresholds run in CI.

## Aggregate flow transport probe

Build the checkout, then run the 64-item map fixture from issue #46 locally:

```sh
npm run build:package
BENCH_OUTPUT=benchmarks/results/flow-transport \
  node --expose-gc benchmarks/flow-transport.mjs
```

`benchmarks/flow-transport.mjs` uses public package exports. The default `BENCH_WORKLOAD=map` fixture has 64 items, concurrency 4, 16,000-character task outputs, and delays of `3 + index % 4` milliseconds. `BENCH_WORKLOAD=nested-history` seeds 12 runs, each with two loop iterations containing eight map tasks with concurrency 2 and 4,000-character outputs. It then measures a thirteenth run with the same task delays. History seeding is outside the measured interval.

Cases are disabled recording, an observer that receives snapshots without storing them (`observer`), recording without readers (`no-readers`), one fast reader (`fast-1`), one reader fully stalled until execution finishes (`stalled-1`), and three fast readers (`fast-3`). Readers check definition availability, authoritative order, terminal success, and every retained item's complete task output. Application results must remain full. These are in-process Request/Response readers, not bandwidth-limited HTTP clients or browsers.

The script runs one warmup per case and three measured rounds by default, reversing case order on alternate rounds. `BENCH_ROUNDS` accepts 1–20; `BENCH_CASE` selects one case. Run baseline and candidate with independently installed dependencies and build outputs, alternating variant order in fresh processes. Copy the same script into both checkouts. For a Git archive without its own `.git`, set `BENCH_ARCHIVE_REVISION` to the exact archived commit; otherwise the script verifies its Git root. Reports retain revision, package source and script hashes, machine/runtime, raw bytes, amplification relative to the final active run, message counts, wall/process CPU time, and heap deltas. With retained history, amplification includes the initial history and is not an active-run-only ratio.

Connection encoding, execution through final delivery, and reconnect are measured separately. Reader decode/JSON parse and map reconstruction time is included in execution timing and also reported separately; it excludes browser schema validation, React, layout, and rendering. Initial payload bytes and parsing time identify retained-history cost. Delivery lag is measured from application completion through receipt and validation of the terminal update. It includes encoding, parsing, and event-loop scheduling, not just the coalescing timer. Task timers make intermediate message counts scheduling-dependent. Report regressions and variability as well as reductions. No-reader comparisons isolate aggregate observer/recorder cost, not transport savings.

Resource diagnostics run separately, in a fresh process with one case and one measured round, without a warmup:

```sh
BENCH_RESOURCES=1 BENCH_CASE=fast-3 BENCH_ROUNDS=1 \
  BENCH_OUTPUT=benchmarks/results/flow-resources \
  node --expose-gc benchmarks/flow-transport.mjs
```

This mode samples heap/RSS every 1 ms through execution and delivery and also records completion memory, process-lifetime maximum RSS, and post-GC checkpoints with retained history and after clear. Sampling misses synchronous peaks. Maximum RSS includes module loading and history seeding. Post-GC checkpoints include runtime infrastructure and possible transient parser allocations; the clear request itself can initialize infrastructure. Completion heap is allocation pressure, and neither post-GC deltas nor a single process's maximum establishes a leak or whole-run memory bound. Use repeated controlled runs or heap-retainer analysis before making retained-memory claims.

Collect CPU profiles in separate runs with Node's `--cpu-prof --cpu-prof-dir=benchmarks/results/<profile-directory>` options and summarize with `node benchmarks/profile-summary.mjs <profile>`. Keep profiling separate from timing comparisons. Compare `no-readers` with `disabled` and `observer` for observer/capture work, and ready-reader cases for cloning, encoding, parsing, and delivery. These diagnostics add no performance thresholds or benchmark jobs to CI.

## Expression overhead comparison

To compare normal flow construction and execution against a Git revision:

```sh
BENCH_OUTPUT=benchmarks/results/expression-overhead \
  node benchmarks/flow-expressions.mjs BASE_COMMIT [CANDIDATE_COMMIT]
```

The candidate defaults to committed `HEAD`; uncommitted runtime changes are excluded. Both revisions are archived and installed with independent locked dependencies and build outputs. The current benchmark script is copied into each archive so both use identical workloads through public exports. Setup may download npm dependencies; measured work makes no network or inference calls.

The four workloads are a simple branch (three steps), a branch with ordinary reused conditions (three steps), six local tasks followed by a branch (nine steps), and two SDK calls with immediate local sample responses followed by a branch (five steps). Both routes and returned values are checked. Each workload measures synchronous definition construction, awaited execution without recording, and execution with the real recorder retaining 50 runs and no readers. These are normal-size expressions; the suite does not measure over-budget rejection or simulate inference latency.

Run without competing builds or benchmarks. Eight rounds by default (`BENCH_ROUNDS=1`–`20`) alternate baseline/candidate order in sequential fresh Node processes. Each case/phase has two warmup batches and five measured batches, with GC outside the timed intervals. Batches contain 2,000 definitions, 2,000 unrecorded runs (500 for sample SDK), or 200 recorded runs. Definition construction is normally paid once when defining a reusable flow, not on every request.

The ignored JSON report records commits, dependency-lock/source/script hashes, machine and Node details, raw wall/process-CPU microseconds per operation, and variability across process medians. Paired percentage changes compare matching rounds; report absolute costs too. This is a warmed local throughput comparison, not a cold-start, memory, browser, or production-latency benchmark. No timing thresholds run in CI.

## Report in the PR

Include:

- Baseline and candidate commit SHAs, plus any uncommitted runtime changes.
- Machine/OS, Node, React and browser versions, viewport, and workload sizes.
- Exact commands, repeat count, run order, and separate timing/profiling methodology.
- Before/after measurements with units and variability, regressions as well as gains, and user-visible tradeoffs.
- Correctness checks, exclusions, and limitations. Sample-call timings are not inference latency; frame gaps are not proof of GPU presentation performance.

Retain raw evidence locally under `benchmarks/results/`. Share an artifact separately if needed and link it from the PR; do not commit it. Historical summaries are in PRs [#13](https://github.com/diegoag64/jev-devtools/pull/13), [#14](https://github.com/diegoag64/jev-devtools/pull/14), [#15](https://github.com/diegoag64/jev-devtools/pull/15), and [#16](https://github.com/diegoag64/jev-devtools/pull/16). Open optimization PRs describe their own proposed changes and measurements.

These are opt-in diagnostics, not hardware-sensitive CI thresholds. Keep other CPU-heavy work stopped during measurements, compare matched workloads, and report uncertainty instead of treating one run as a universal speedup.
