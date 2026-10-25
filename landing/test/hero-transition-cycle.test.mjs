import assert from "node:assert/strict";
import test from "node:test";
import { createTransitionCycle } from "../src/hero-effects/transition-cycle.ts";

test("a takeover keeps its mask and changes palettes only at a complete boundary", (t) => {
  t.mock.method(Math, "random", () => 0.4);
  const cycle = createTransitionCycle();
  const start = cycle(0);
  assert.equal(start.from, "prism");
  assert.equal(start.to, "jade");
  assert.equal(start.progress, 0);
  const middle = cycle(16);
  const end = cycle(31.999);
  assert.equal(middle.kind, start.kind);
  assert.equal(end.kind, start.kind);
  assert.ok(Math.abs(middle.progress - 0.5) < 1e-12);
  assert.ok(end.progress > 0.999999);
  const returning = cycle(32);
  assert.equal(returning.from, end.to);
  assert.equal(returning.to, start.from);
  assert.equal(returning.progress, 0);
  assert.notEqual(returning.kind, end.kind);
  const secondEnd = cycle(63.999);
  assert.equal(secondEnd.kind, returning.kind);
  assert.ok(secondEnd.progress > 0.999999);
  const next = cycle(64);
  assert.equal(next.from, secondEnd.to);
  assert.equal(next.to, start.to);
  assert.equal(next.progress, 0);
});

test("random selection varies but never immediately repeats even with identical draws", (t) => {
  let draw = 0;
  t.mock.method(Math, "random", () => draw);
  const firstKinds = [];
  for (const value of [0, 0.999999]) {
    draw = value;
    const cycle = createTransitionCycle();
    let previous;
    for (let pass = 0; pass < 100; pass++) {
      const current = cycle(pass * 32);
      if (previous) assert.notEqual(current.kind, previous.kind);
      else firstKinds.push(current.kind);
      previous = current;
    }
  }
  assert.notEqual(firstKinds[0], firstKinds[1]);
});
