import assert from "node:assert/strict";
import { test } from "node:test";
import { maps, loops, genericReferences, unionSources, booleans, brandedReferences, brandedTemplates } from "./packed-resolved-templates.js";

const client = { systemOne() { throw new Error("Unexpected inference request"); } };

test("packed map types and execution agree for literal, reference, and nested templates", async () => {
  for (const mixed of [4, "four"]) {
    const { outcome, value } = await maps.run({ count: 1, values: [2, 3], mixed }, { client });
    assert.deepEqual({ outcome, value }, {
      outcome: "done", value: { literal: [2, 4], whole: [4, 6], references: [2, 4], nested: [7] },
    });
  }
});

test("packed loop types and execution agree for gates, next states, and final states", async () => {
  for (const count of [0, 2]) {
    const { outcome, value } = await loops.run({ count, keepGoing: true }, { client });
    assert.deepEqual({ outcome, value }, {
      outcome: "done",
      value: {
        literal: 2,
        whole: { count: 2, keepGoing: true },
        nested: { count: 2, pair: [count, count], keepGoing: count === 2 },
      },
    });
  }
});

test("packed generic helpers and scalar inference agree with execution", async () => {
  const { value } = await genericReferences.run({
    values: [1, 2], count: 2, records: [{ id: "first" }, { id: "second" }],
  }, { client });
  assert.deepEqual(value, {
    copied: [1, 2], matched: [false, true], kept: 2,
    copiedScalars: [1, 2], keptScalar: 2,
    records: [{ id: "first" }, { id: "second" }],
  });
  for (const useReference of [true, false]) {
    const result = await unionSources(useReference).run({ values: [1, 2], state: 2 }, { client });
    assert.deepEqual(result.value, { mapped: [1, 2], kept: 2 });
  }
  const result = await booleans.run(null, { client });
  assert.deepEqual(result.value, { started: true, stopped: false, compared: [false], kept: false });
});

test("packed branded scalars remain numeric in whole references and literal templates", async () => {
  const whole = await brandedReferences.run({ count: 2, values: [1, 2] }, { client });
  assert.deepEqual(whole.value, { mapped: [2, 4], kept: 2 });
  const literal = await brandedTemplates(2).run(null, { client });
  assert.deepEqual(literal.value, { mapped: [2], kept: { count: 2 }, doubled: 4 });
});
