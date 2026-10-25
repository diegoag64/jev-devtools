import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineJevFlow,
  all,
  any,
  not,
  type FlowExpression,
} from "../flow/index.js";

const options = {
  client: {
    systemOne: (): never => {
      throw new Error("Unexpected inference");
    },
  },
};

function negate(value: FlowExpression<boolean>, count: number) {
  for (let i = 0; i < count; i++) value = not(value);
  return value;
}

// Counts expanded occurrences: eleven doublings contain 4095 nodes, despite
// reusing just one expression at each level.
function shared(value: FlowExpression<boolean>) {
  for (let i = 0; i < 11; i++) value = all(value, value);
  return value;
}

test("composed conditions enforce depth 80 including literal comparisons", async () => {
  for (const literal of [false, true]) {
    for (const depth of [79, 80, 81]) {
      const build = () =>
        defineJevFlow<boolean>("depth", (f) => {
          const value = negate(
            literal ? f.input.eq(true) : f.input,
            depth - Number(literal),
          );
          return f.branch("decision", {
            when: value,
            then: (p) => p.output("yes"),
            else: (p) => p.output("no"),
          });
        });
      if (depth > 80) {
        assert.throws(build, /Expression nesting exceeds 80/);
      } else {
        const flow = build();
        for (const input of [true, false]) {
          const expected = (depth - Number(literal)) % 2 ? !input : input;
          assert.equal(
            (await flow.run(input, options)).outcome,
            expected ? "yes" : "no",
          );
        }
      }
    }
  }
});

test("composed get paths enforce depth 80 in whole and nested value templates", async () => {
  type Nested = { next: Nested; flag: boolean };
  for (const depth of [79, 80, 81]) {
    const build = () =>
      defineJevFlow<Nested>("path-depth", (f) => {
        let value = f.input;
        for (let i = 1; i < depth; i++) value = value.get("next");
        const flag = value.get("flag");
        const whole = f.task("whole", { input: flag, run: (value) => value });
        return f.output("done", { literal: true, whole, nested: [{ flag }] });
      });
    if (depth > 80) {
      assert.throws(build, /Expression nesting exceeds 80/);
    } else {
      let input = { flag: true } as Nested;
      for (let i = 1; i < depth; i++) input = { next: input, flag: false };
      assert.deepEqual((await build().run(input, options)).value, {
        literal: true,
        whole: true,
        nested: [{ flag: true }],
      });
    }
  }
});

test("reused conditions count every expanded occurrence against 4096 nodes", async () => {
  for (const nodes of [4095, 4096, 4097]) {
    const build = () =>
      defineJevFlow<boolean>("size", (f) => {
        const value = negate(shared(f.input), nodes - 4095);
        return f.branch("decision", {
          when: value,
          then: (p) => p.output("yes", { whole: value, nested: [value] }),
          else: (p) => p.output("no", { whole: value, nested: [value] }),
        });
      });
    if (nodes > 4096) {
      assert.throws(build, /Expression size exceeds 4096 expanded nodes/);
    } else {
      const flow = build();
      for (const input of [true, false]) {
        const expected = nodes === 4095 ? input : !input;
        const result = await flow.run(input, options);
        assert.equal(result.outcome, expected ? "yes" : "no");
        assert.deepEqual(result.value, { whole: expected, nested: [expected] });
      }
    }
  }
  for (const combine of [all, any]) {
    assert.throws(
      () =>
        defineJevFlow<boolean>("doubling", (f) => {
          const value = shared(f.input);
          return f.output("done", combine(value, value));
        }),
      /Expression size exceeds 4096 expanded nodes/,
    );
  }
});

test("legacy descriptions respect the character cap without shortening reference keys", async () => {
  for (const length of [4095, 4096, 4097]) {
    // The public description is input.<key>; input plus dot consumes six characters.
    const key = "k".repeat(length - 6);
    const flow = defineJevFlow<Record<string, boolean>>("description", (f) =>
      f.branch("decision", {
        when: f.input.get(key),
        then: (p) => p.output("yes"),
        else: (p) => p.output("no"),
      }),
    );
    const description = flow.definition.nodes[0].condition!;
    assert.equal(description.length, Math.min(length, 4096));
    if (length <= 4096) assert.equal(description, `input.${key}`);
    else assert.ok(description.endsWith("[condition truncated]"));
    assert.equal((await flow.run({ [key]: true }, options)).outcome, "yes");
    await assert.rejects(flow.run({}, options), (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, `Missing value: ${description}`);
      return true;
    });
  }
});

test("shared loop gates stay bounded and evaluate all operands", async () => {
  const flow = defineJevFlow<boolean>("loop-gate", (f) => {
    const result = f.loop(
      "loop",
      {
        initial: f.input,
        input: {},
        maxIterations: 1,
        while: (state) => shared(state),
      },
      (iteration) =>
        iteration.task("stop", { input: false, run: (value) => value }),
    );
    return f.output("done", result);
  });
  assert.equal((await flow.run(true, options)).value, false);
  assert.throws(
    () =>
      defineJevFlow<boolean>("large-loop-gate", (f) => {
        const result = f.loop(
          "loop",
          {
            initial: f.input,
            input: {},
            maxIterations: 1,
            while: (state) => {
              const value = shared(state);
              return all(value, value);
            },
          },
          (iteration) =>
            iteration.task("stop", { input: false, run: (value) => value }),
        );
        return f.output("done", result);
      }),
    /Expression size exceeds 4096 expanded nodes/,
  );

  const missing = defineJevFlow<{ flag: boolean; missing: boolean }>(
    "eager",
    (f) => {
      const gate = all(f.input.get("flag"), f.input.get("missing"));
      return f.output("done", all(gate, gate));
    },
  );
  await assert.rejects(
    missing.run(
      { flag: false } as { flag: boolean; missing: boolean },
      options,
    ),
    /Missing value: input.missing/,
  );
});
