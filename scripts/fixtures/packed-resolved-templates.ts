// Compiled AND executed by verify-package.mjs against the installed archive.
import {
  defineJevFlow,
  type FlowBuilder,
  type FlowExpression,
} from "jev-devtools/flow";

export const maps = defineJevFlow<{
  count: number;
  values: readonly number[];
  mixed: number | string;
}>("resolved-maps", (f) => {
  const count = f.input.get("count");
  const literal = f.map(
    "literal",
    {
      items: [1, 2],
      input: null,
      maxItems: 2,
    },
    (item) =>
      item.task("double", {
        input: item.input.get("item"),
        run: (value) => value * 2,
      }),
  );
  const whole = f.map(
    "whole",
    {
      items: f.input.get("values"),
      input: null,
      maxItems: 2,
    },
    (item) =>
      item.task("double", {
        input: item.input.get("item"),
        run: (value) => value * 2,
      }),
  );
  const references = f.map(
    "references",
    {
      items: [count, 2],
      input: null,
      maxItems: 2,
    },
    (item) => {
      const value: FlowExpression<number> = item.input.get("item");
      return item.if("positive", {
        when: value.gt(0),
        then: (path) =>
          path.task("double", {
            input: value,
            run: (n) => {
              const number: number = n;
              return number * 2;
            },
          }),
        else: () => value,
      });
    },
  );
  const nested = f.map(
    "nested",
    {
      items: [{ pair: [count, count], mixed: f.input.get("mixed") }] as const,
      input: { increment: count },
      maxItems: 1,
    },
    (item) => {
      const pair: FlowExpression<readonly [number, number]> = item.input
        .get("item")
        .get("pair");
      return item.task("sum", {
        input: {
          pair,
          mixed: item.input.get("item").get("mixed"),
          context: item.input.get("context"),
        },
        run: ({ pair, mixed, context }) => {
          const value: number | string = mixed;
          return (
            pair[0] +
            pair[1] +
            context.increment +
            (typeof value === "number" ? value : value.length)
          );
        },
      });
    },
  );
  const result: FlowExpression<number[]> = references;
  return f.output("done", { literal, whole, references: result, nested });
});

export const loops = defineJevFlow<{ count: number; keepGoing: boolean }>(
  "resolved-loops",
  (f) => {
    const literal = f.loop(
      "literal",
      {
        initial: 0,
        input: null,
        while: (s) => s.lt(2),
        maxIterations: 2,
      },
      (iteration) =>
        iteration.task("advance", {
          input: iteration.input.get("state"),
          run: (state) => state + 1,
        }),
    );
    const whole = f.loop(
      "whole",
      {
        initial: f.input,
        input: null,
        while: (s) => s.get("count").lt(2),
        maxIterations: 2,
      },
      (iteration) =>
        iteration.task("advance", {
          input: iteration.input.get("state"),
          run: (state) => ({ ...state, count: state.count + 1 }),
        }),
    );
    const count = f.input.get("count");
    const nested = f.loop(
      "nested",
      {
        initial: { count, pair: [count, count] as const, keepGoing: true },
        input: { increment: 1 },
        while: (s) => s.get("count").lt(2),
        maxIterations: 2,
      },
      (iteration) => {
        const state: FlowExpression<{
          count: number;
          pair: readonly [number, number];
          keepGoing: boolean;
        }> = iteration.input.get("state");
        const values = iteration.map(
          "sum-pair",
          {
            items: state.get("pair"),
            input: null,
            maxItems: 2,
          },
          (item) => item.input.get("item"),
        );
        return iteration.task("advance", {
          input: { state, values, context: iteration.input.get("context") },
          run: ({ state, values, context }) => {
            const number: number = state.count;
            return {
              count: number + context.increment,
              pair: [values[0], values[1]] as const,
              keepGoing: false,
            };
          },
        });
      },
    );
    const result: FlowExpression<{
      count: number;
      pair: readonly [number, number];
      keepGoing: boolean;
    }> = nested;
    return f.output("done", { literal, whole, nested: result });
  },
);

// Whole-value references must retain generic payloads, not deferred Resolved<T>.
function copy<T>(
  f: FlowBuilder<unknown>,
  id: string,
  items: FlowExpression<readonly T[]>,
): FlowExpression<T[]> {
  return f.map(id, { items, input: null, maxItems: 2 }, (item) =>
    item.input.get("item"),
  );
}

function matches<T extends number>(
  f: FlowBuilder<unknown>,
  items: FlowExpression<readonly T[]>,
  target: T,
) {
  return f.map("matches", { items, input: null, maxItems: 2 }, (item) =>
    item.input.get("item").eq(target),
  );
}

function copyScalars<T extends number>(
  f: FlowBuilder<unknown>,
  items: readonly T[],
): FlowExpression<T[]> {
  return f.map("copy-scalars", { items, input: null, maxItems: 2 }, (item) =>
    item.input.get("item"),
  );
}

function keep<T extends number>(
  f: FlowBuilder<unknown>,
  id: string,
  initial: T | FlowExpression<T>,
): FlowExpression<T> {
  return f.loop(
    id,
    {
      initial,
      input: null,
      while: (s) => s.lt(0),
      maxIterations: 1,
    },
    (iteration) => iteration.input.get("state"),
  );
}

export const genericReferences = defineJevFlow<{
  values: (1 | 2)[];
  count: 1 | 2;
  records: { id: string }[];
}>("generic-references", (f) => {
  const values = f.input.get("values");
  return f.output("done", {
    copied: copy(f, "copy-numbers", values),
    matched: matches(f, values, 2),
    kept: keep(f, "keep-reference", f.input.get("count")),
    copiedScalars: copyScalars(f, [1, 2]),
    keptScalar: keep(f, "keep-scalar", 2),
    records: copy(f, "copy-records", f.input.get("records")),
  });
});

// The reference overloads must still accept reference-or-literal options.
export function unionSources(useReference: boolean) {
  return defineJevFlow<{ values: number[]; state: number }>(
    "union-sources",
    (f) => {
      const mapped: FlowExpression<number[]> = f.map(
        "copy",
        {
          items: useReference ? f.input.get("values") : [1, 2],
          input: null,
          maxItems: 2,
        },
        (item) => item.input.get("item"),
      );
      const kept: FlowExpression<number> = f.loop(
        "keep",
        {
          initial: useReference ? f.input.get("state") : 2,
          input: null,
          while: (s) => s.lt(0),
          maxIterations: 1,
        },
        (iteration) => iteration.input.get("state"),
      );
      return f.output("done", { mapped, kept });
    },
  );
}

function keepBoolean<T extends boolean>(
  f: FlowBuilder<unknown>,
  initial: T,
): FlowExpression<T> {
  return f.loop(
    "generic-boolean",
    {
      initial,
      input: null,
      while: (s) => s.eq(initial).eq(false),
      maxIterations: 1,
    },
    (iteration) => iteration.input.get("state"),
  );
}

export const booleans = defineJevFlow("boolean-inference", (f) => {
  const started = f.loop(
    "start",
    {
      initial: false,
      input: null,
      while: (s) => s.eq(false),
      maxIterations: 1,
    },
    (iteration) => iteration.task("finish", { input: null, run: () => true }),
  );
  const stopped = f.loop(
    "stop",
    {
      initial: true,
      input: null,
      while: (s) => s.eq(true),
      maxIterations: 1,
    },
    (iteration) => iteration.task("finish", { input: null, run: () => false }),
  );
  const compared = f.map(
    "compare",
    {
      items: [false],
      input: null,
      maxItems: 1,
    },
    (item) => item.input.get("item").eq(true),
  );
  return f.output("done", {
    started,
    stopped,
    compared,
    kept: keepBoolean(f, false),
  });
});

type Count = number & { readonly __brand: "Count" };

export const brandedReferences = defineJevFlow<{
  count: Count;
  values: Count[];
}>("branded-references", (f) => {
  const mapped: FlowExpression<number[]> = f.map(
    "double",
    {
      items: f.input.get("values"),
      input: null,
      maxItems: 2,
    },
    (item) => {
      const value: FlowExpression<Count> = item.input.get("item");
      return item.task("multiply", {
        input: value,
        run: (n) => n * 2,
      });
    },
  );
  const kept: FlowExpression<Count> = f.loop(
    "keep",
    {
      initial: f.input.get("count"),
      input: null,
      while: (s) => s.lt(0),
      maxIterations: 1,
    },
    (iteration) => iteration.input.get("state"),
  );
  return f.output("done", { mapped, kept });
});

// Literal templates also preserve branded scalar fields instead of mapping
// their number methods into an object. This exercises Resolved independently
// of the whole-reference overloads above.
export function brandedTemplates(count: Count) {
  return defineJevFlow("branded-templates", (f) => {
    const mapped: FlowExpression<Count[]> = f.map(
      "copy",
      {
        items: [count],
        input: null,
        maxItems: 1,
      },
      (item) => item.input.get("item"),
    );
    const kept: FlowExpression<{ count: Count }> = f.loop(
      "keep",
      {
        initial: { count },
        input: null,
        while: (s) => s.get("count").lt(0),
        maxIterations: 1,
      },
      (iteration) => iteration.input.get("state"),
    );
    const doubled = f.task("double", {
      input: { count },
      run: ({ count }) => count * 2,
    });
    return f.output("done", { mapped, kept, doubled });
  });
}

// Never executed: these calls must be rejected by the packed declarations.
function invalidTemplates() {
  defineJevFlow<{ count: number }>("invalid-templates", (f) => {
    const mapped = f.map(
      "map",
      {
        items: [f.input.get("count")],
        input: null,
        maxItems: 1,
      },
      (item) =>
        item.task("expression-method", {
          input: item.input.get("item"),
          // @ts-expect-error runtime supplies a number, not an expression
          run: (value) => value.lt(2),
        }),
    );
    const looped = f.loop(
      "loop",
      {
        initial: { count: f.input.get("count"), keepGoing: true },
        input: null,
        while: (s) => s.get("keepGoing").eq(true),
        maxIterations: 1,
      },
      (iteration) =>
        iteration.task("expression-method", {
          input: iteration.input.get("state"),
          run: (state) => {
            // @ts-expect-error runtime state fields are resolved values
            state.count.lt(2);
            return state;
          },
        }),
    );
    // @ts-expect-error final state retains the resolved numeric field
    const wrong: FlowExpression<{
      count: FlowExpression<number>;
      keepGoing: boolean;
    }> = looped;
    // TS 5.4 and newer compilers locate this overload error on different arguments.
    // Keep the complete call on one line so both must reject the same operation.
    // prettier-ignore
    // @ts-expect-error the body must return the resolved initial shape; it cannot widen state
    f.loop("wrong-next-state", { initial: { count: f.input.get("count") }, input: null, while: (s) => s.get("count").lt(2), maxIterations: 1 }, (iteration) => iteration.task("wrong", { input: null, run: () => ({ count: "text" }) }));
    // prettier-ignore
    // @ts-expect-error the whole-reference overload cannot widen the next state either
    f.loop("wrong-whole-state", { initial: f.input, input: null, while: (s) => s.get("count").lt(2), maxIterations: 1 }, (iteration) => iteration.task("wrong", { input: null, run: () => ({ count: "text" }) }));
    // @ts-expect-error preserving brands must not make ordinary numbers branded
    const unearnedBrand: FlowExpression<Count> = f.input.get("count");
    // prettier-ignore
    // @ts-expect-error an explicitly selected literal state must not widen
    f.loop<false, null>("explicit-false", { initial: false, input: null, while: (s) => s.eq(false), maxIterations: 1 }, (iteration) => iteration.task("wrong", { input: null, run: () => true }));
    return f.output("done", { mapped, wrong });
  });
}
