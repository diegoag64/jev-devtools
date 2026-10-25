import test from "node:test";
import assert from "node:assert/strict";
import { renderChangelog } from "../changelog.js";
import { compile } from "../site.js";
import { tryOperations, count } from "../examples/operations.js";
import { replayExample } from "../examples/replay.js";
import { tryGreeting } from "../examples/first-flow.js";
import { tryTask } from "../examples/flow-task.js";
import { delivery, tryDelivery } from "../examples/flow-if.js";
import { route, tryBranch } from "../examples/flow-branch.js";
import { tryParallel } from "../examples/flow-parallel.js";
import { doubleEach, tryMap } from "../examples/flow-map.js";
import { tryLoop } from "../examples/flow-loop.js";
import { tryClassify } from "../examples/flow-jev.js";
import { tryCustomQuestion } from "../examples/flow-factory.js";
import { tryJoin } from "../examples/flow-join.js";
import { FlowLoopLimitError, replayClient } from "jev-devtools/flow";

test("code examples render as text while repeated headings get distinct deep links", async () => {
  const result = await compile(
    "## Setup\n\n## Setup\n\n```tsx\n<JevDevtools enabled />\n```",
  );
  assert.deepEqual(
    result.headings.map((h) => h.id),
    ["setup", "setup-1"],
  );
  assert.ok(result.html.includes('href="#setup-1"'));
  assert.match(result.html, /&(?:lt;|#x3C;)/);
  assert.ok(!result.html.includes("<JevDevtools"));
});

test("documented task examples return the explained values and report loop exhaustion", async () => {
  const client = {
    systemOne() {
      throw new Error("Task-only examples must not call inference");
    },
  };
  const first = await tryGreeting();
  assert.equal(first.outcome, "greeted");
  assert.equal(first.value, "Ada");
  assert.equal((await tryTask()).value, "Hello, Ada!");
  for (const express of [true, false])
    assert.equal((await (express ? tryDelivery() : delivery.run({ express }, { client }))).value,
      `Delivery in ${express ? 1 : 5} day(s)`);
  for (const needsReview of [true, false])
    assert.equal((await (needsReview ? tryBranch() : route.run({ needsReview }, { client }))).outcome,
      needsReview ? "manual-review" : "ready");
  assert.deepEqual((await tryParallel()).value, { regular: 100, sale: 80 });
  assert.deepEqual((await tryMap()).value, [4, 8, 12]);
  assert.deepEqual((await doubleEach.run({ numbers: [] }, { client })).value, []);
  assert.equal((await tryLoop()).value, 3);
  const { summary: result, counted } = await tryOperations();
  assert.deepEqual((await tryJoin()).value, { left: 4, right: 9 });
  assert.equal(result.outcome, "summary");
  assert.deepEqual(result.value, { total: 12, label: "Large: 12" });
  assert.deepEqual(counted.value, {
    value: 3,
    target: 3,
  });
  await assert.rejects(
    count.run({ target: 11 }, { client }),
    FlowLoopLimitError,
  );
});

test("documented replay fixture produces the explained outcome without a key", async () => {
  const result = await replayExample();
  assert.equal(result.outcome, "routed");
  assert.equal(result.value, "billing");
});

// The docs build must reject invalid opted-in examples instead of publishing
// convincing hovers for code that no longer matches the public API.
test("interactive examples fail the build on TypeScript errors", async () => {
  await assert.rejects(
    compile(
      '```ts twoslash file=flow.ts\nconst count: number = "not a number";\n```',
    ),
    /not assignable/,
  );
});

// Receiver-aware selection must not turn similarly named application members
// or SDK options into API help; the real pages cover the standard spellings.
test("API help follows imported aliases while respecting local scope and option ownership", async () => {
  const cases = [
    {
      language: "ts",
      source: `import { createJevDevtools as make } from "jev-devtools/server";
const adapter = make({ enabled: true, origin: "http://localhost:3000" });
adapter.createClient({ apiKey: "example" }, { label: "demo" });
const local = { enabled: true };
function application(adapter: { run(): void }) { adapter.run(); }`,
      labels: ["make", "enabled", "origin", "createClient", "label"],
    },
    {
      language: "tsx",
      source: `import { JevDevtools as Panel } from "jev-devtools";
const api = <Panel enabled defaultOpen={false} />;
const ordinary = <Custom enabled defaultOpen={false} />;`,
      labels: ["Panel", "enabled", "defaultOpen"],
    },
    {
      language: "ts",
      flags: "types",
      source: `new JevRecorder(options?: CaptureOptions): JevRecorder;
const options: FlowRunOptions = settings;
const label = "CaptureOptions"; // FlowRunOptions is mentioned in a comment
const ordinary: string = "hello";`,
      labels: ["CaptureOptions", "FlowRunOptions"],
    },
  ];
  for (const example of cases) {
    const result = await compile(
      `\x60\x60\x60${example.language} ${example.flags ?? "api=core"}\n${example.source}\n\x60\x60\x60`,
    );
    const labels = [
      ...result.html.matchAll(/aria-label="([^"]+): API help"/g),
    ].map((match) => match[1]);
    assert.deepEqual(labels, example.labels);
  }
});

// The changelog is fetched from GitHub during publication. Preserve its content
// and links without interpreting embedded markup as executable page content.
test("changelog releases preserve source anchors and resolve repository links safely", () => {
  const result = renderChangelog(`# Changelog

Introductory context.

## Unreleased

- A pending change.

## 1.2.3 — October 25, 2026 (experimental)

### Changes

#### Fixed

- Read the [release notes](docs/releases.md#release).
- [Unsafe](javascript:alert%281%29)

<script>alert('injected')</script>

## 1.2.2 — October 24, 2026 (experimental)

### Changes

#### Fixed

- Another correction.
`);
  assert.ok(result.html.includes('id="123--october-25-2026-experimental"'));
  assert.ok(result.html.includes('href="https://github.com/diegoag64/jev-devtools/blob/main/docs/releases.md#release"'));
  assert.ok(result.html.includes("Not published to npm"));
  assert.ok(result.html.includes('href="#123--october-25-2026-experimental-fixed"'));
  assert.ok(result.html.includes('id="123--october-25-2026-experimental-fixed"'));
  assert.ok(result.html.includes('id="122--october-24-2026-experimental-fixed"'));
  assert.ok(result.html.includes("A pending change."));
  assert.ok(result.html.includes("Introductory context."));
  assert.ok(!result.html.includes("<script>"));
  assert.ok(!result.html.includes('href="javascript:'));
  assert.throws(() => renderChangelog("<html>Gateway error</html>"), /Invalid changelog/);
});

// Exercise the actual documented request forms with stored SDK responses.
// The prose deliberately does not promise this answer from a live model.
test("beginner Jev examples resolve named answers and factory answer objects", async () => {
  const answers = {
    team: { type: "choice", choice: "billing", probabilities: { billing: 0.8, support: 0.2 }, confidence: 0.6 },
  };
  const stored = (flow: string, step: string) => replayClient({
    version: 1, flow, steps: { [step]: { model: "jev-sample", answers } },
  });
  assert.equal((await tryClassify(stored("classify", "ask-team"))).value, "billing");
  assert.deepEqual((await tryCustomQuestion(stored("custom-question", "ask"))).value, answers);
});
