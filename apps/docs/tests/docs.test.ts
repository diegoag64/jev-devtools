import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../site.js";
import { summarize, count } from "../examples/operations.js";
import { replayExample } from "../examples/replay.js";
import { FlowLoopLimitError } from "jev-devtools/flow";

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
  const result = await summarize.run({ values: [2, 4] }, { client });
  assert.equal(result.outcome, "summary");
  assert.deepEqual(result.value, { total: 12, label: "Large: 12" });
  assert.deepEqual((await count.run({ target: 3 }, { client })).value, {
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
  ];
  for (const example of cases) {
    const result = await compile(
      `\x60\x60\x60${example.language} api=core\n${example.source}\n\x60\x60\x60`,
    );
    const labels = [
      ...result.html.matchAll(/aria-label="([^"]+): API help"/g),
    ].map((match) => match[1]);
    assert.deepEqual(labels, example.labels);
  }
});
