import assert from "node:assert/strict";
import { test } from "node:test";
import { defineJevFlow } from "jev-devtools/flow";
import { controls, brandedOperands } from "./packed-expression-contracts.js";
const options = {
  client: {
    systemOne() {
      throw new Error("Unexpected inference request");
    },
  },
};

test("packed scalar, generic, branded, tuple, and union controls execute", async () => {
  for (const scalar of [3, "three"]) {
    const { value } = await controls.run(
      {
        count: 3,
        label: "label",
        literal: "yes",
        flag: true,
        empty: null,
        scalar,
        nullable: typeof scalar === "number" ? 3 : null,
        items: [3, 4],
        tuple: ["first", 2],
        union: [scalar],
        record: { value: 7, map: "own field", 0: "zero" },
        objectUnion: { value: scalar },
      },
      options,
    );
    assert.deepEqual(value, {
      count: true,
      label: true,
      literal: true,
      flag: true,
      empty: true,
      scalar: true,
      nullable: true,
      first: 3,
      length: 2,
      firstTuple: "first",
      stringTuple: 2,
      tupleLength: 2,
      unionItem: scalar,
      unionField: scalar,
      field: 7,
      selected: 7,
      ownMap: "own field",
      numericField: "zero",
    });
  }
});

test("packed branded literal operands retain their scalar execution", async () => {
  const flow = brandedOperands("label", 3);
  assert.deepEqual(
    (await flow.run({ label: "label", count: 3 }, options)).value,
    { label: true, count: true },
  );
  assert.deepEqual(
    (await flow.run({ label: "other", count: 4 }, options)).value,
    { label: false, count: false },
  );
});

test("JavaScript equality still rejects non-scalars, mismatched types, and non-finite numbers", async () => {
  for (const [left, right] of [
    [{}, {}],
    [[1], [1]],
    [undefined, undefined],
    [1, "1"],
    [null, {}],
    [NaN, NaN],
    [Infinity, Infinity],
    [1, -Infinity],
  ]) {
    const flow = defineJevFlow("invalid-equality", (f) =>
      f.output("done", f.input.eq(right)),
    );
    await assert.rejects(
      flow.run(left, options),
      /eq requires matching scalar values/,
    );
  }
});

test("JavaScript array methods, absent fields, and bounds remain execution checks", async () => {
  for (const [input, key] of [
    [[1], "map"],
    [[1], 2],
    [[1], -1],
    [[1], 0.5],
    [{}, "optional"],
    [{ optional: undefined }, "optional"],
  ]) {
    const flow = defineJevFlow("missing-field", (f) =>
      f.output("done", f.input.get(key)),
    );
    await assert.rejects(flow.run(input, options), /Missing value/);
  }
});
