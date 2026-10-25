import assert from "node:assert/strict";
import { test } from "node:test";
import { maps, loops } from "./packed-resolved-templates.js";

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
