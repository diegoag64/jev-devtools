import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("../../../scripts/replay-fixture.mjs", import.meta.url));
const response = (answers: Record<string, unknown>) => ({ model: "cli-test", answers });
const fixture = (risk = 0.1) => ({
  version: 1,
  flow: "refund-review",
  steps: {
    triage: response({ category: { type: "choice", choice: "refund", confidence: 0.9, probabilities: { refund: 0.9, other: 0.1 } } }),
    review: response({ eligible: { type: "noul", noul: 0.94 }, risky: { type: "noul", noul: risk } }),
  },
});
function cli(args: string[], input = "") {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    input, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, TYPESAFE_API_KEY: "" },
  });
}

test("replay CLI consumes stdin and reports an outcome mismatch with a failing exit code", () => {
  const approved = cli(["-", "--expect", "approve"], JSON.stringify(fixture()));
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(JSON.parse(approved.stdout).outcome, "approve");
  assert.deepEqual(JSON.parse(approved.stdout).value, { eligibility: 0.94 });
  const changed = cli(["-", "--expect", "approve"], JSON.stringify(fixture(0.9)));
  assert.equal(changed.status, 1, changed.stderr);
  assert.equal(JSON.parse(changed.stdout).outcome, "manual-review");
  assert.match(changed.stderr, /Expected outcome "approve", received "manual-review"/);
});

test("replay CLI reads fixture and input files and selects the parallel flow", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "jev-replay-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "fixture.json");
  const inputPath = join(dir, "input.json");
  const input = { message: "Please review this ticket." };
  writeFileSync(inputPath, JSON.stringify(input));
  writeFileSync(path, JSON.stringify({ version: 1, flow: "parallel-review", steps: {
    eligibility: response({ eligible: { type: "noul", noul: 0.95 } }),
    risk: response({ risky: { type: "noul", noul: 0.05 } }),
    combined: response({ ready: { type: "noul", noul: 0.96 } }),
  } }));
  const result = cli([path, "--input", inputPath, "--expect", "ready-output"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    flow: "parallel-review", input, outcome: "ready-output", value: { eligibility: 0.95, risk: 0.05 },
  });
});

test("replay CLI rejects empty, invalid, unsupported and partial fixtures without reporting success", () => {
  const partial = fixture();
  Reflect.deleteProperty(partial.steps, "review");
  for (const [input, message] of [
    ["", /No fixture JSON found/],
    ["not JSON", /JSON/],
    [JSON.stringify({ ...fixture(), flow: "unknown-flow" }), /Unsupported flow "unknown-flow"/],
    [JSON.stringify(partial), /no response for step "review"/],
  ] as const) {
    const result = cli(["-"], input);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
    assert.equal(result.stdout, "");
  }
});
