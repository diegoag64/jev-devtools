// Compiled AND executed by verify-package.mjs against the installed archive.
import { defineJevFlow, type FlowExpression } from "jev-devtools/flow";

export const maps = defineJevFlow<{
  count: number;
  values: readonly number[];
  mixed: number | string;
}>("resolved-maps", (f) => {
  const count = f.input.get("count");
  const literal = f.map("literal", {
    items: [1, 2], input: null, maxItems: 2,
  }, (item) => item.task("double", {
    input: item.input.get("item"), run: (value) => value * 2,
  }));
  const whole = f.map("whole", {
    items: f.input.get("values"), input: null, maxItems: 2,
  }, (item) => item.task("double", {
    input: item.input.get("item"), run: (value) => value * 2,
  }));
  const references = f.map("references", {
    items: [count, 2], input: null, maxItems: 2,
  }, (item) => {
    const value: FlowExpression<number> = item.input.get("item");
    return item.if("positive", {
      when: value.gt(0),
      then: (path) => path.task("double", {
        input: value, run: (n) => { const number: number = n; return number * 2; },
      }),
      else: () => value,
    });
  });
  const nested = f.map("nested", {
    items: [{ pair: [count, count], mixed: f.input.get("mixed") }] as const,
    input: { increment: count }, maxItems: 1,
  }, (item) => {
    const pair: FlowExpression<readonly [number, number]> = item.input.get("item").get("pair");
    return item.task("sum", {
      input: { pair, mixed: item.input.get("item").get("mixed"), context: item.input.get("context") },
      run: ({ pair, mixed, context }) => {
        const value: number | string = mixed;
        return pair[0] + pair[1] + context.increment + (typeof value === "number" ? value : value.length);
      },
    });
  });
  const result: FlowExpression<number[]> = references;
  return f.output("done", { literal, whole, references: result, nested });
});

export const loops = defineJevFlow<{ count: number; keepGoing: boolean }>("resolved-loops", (f) => {
  const literal = f.loop("literal", {
    initial: 0, input: null, while: (s) => s.lt(2), maxIterations: 2,
  }, (iteration) => iteration.task("advance", {
    input: iteration.input.get("state"), run: (state) => state + 1,
  }));
  const whole = f.loop("whole", {
    initial: f.input, input: null, while: (s) => s.get("count").lt(2), maxIterations: 2,
  }, (iteration) => iteration.task("advance", {
    input: iteration.input.get("state"), run: (state) => ({ ...state, count: state.count + 1 }),
  }));
  const count = f.input.get("count");
  const nested = f.loop("nested", {
    initial: { count, pair: [count, count] as const, keepGoing: true },
    input: { increment: 1 },
    while: (s) => s.get("count").lt(2), maxIterations: 2,
  }, (iteration) => {
    const state: FlowExpression<{ count: number; pair: readonly [number, number]; keepGoing: boolean }> = iteration.input.get("state");
    const values = iteration.map("sum-pair", {
      items: state.get("pair"), input: null, maxItems: 2,
    }, (item) => item.input.get("item"));
    return iteration.task("advance", {
      input: { state, values, context: iteration.input.get("context") },
      run: ({ state, values, context }) => {
        const number: number = state.count;
        return { count: number + context.increment, pair: [values[0], values[1]] as const, keepGoing: false };
      },
    });
  });
  const result: FlowExpression<{ count: number; pair: readonly [number, number]; keepGoing: boolean }> = nested;
  return f.output("done", { literal, whole, nested: result });
});

// Never executed: these calls must be rejected by the packed declarations.
function invalidTemplates() {
  defineJevFlow<{ count: number }>("invalid-templates", (f) => {
    const mapped = f.map("map", {
      items: [f.input.get("count")], input: null, maxItems: 1,
    }, (item) => item.task("expression-method", {
      input: item.input.get("item"),
      // @ts-expect-error runtime supplies a number, not an expression
      run: (value) => value.lt(2),
    }));
    const looped = f.loop("loop", {
      initial: { count: f.input.get("count"), keepGoing: true },
      input: null, while: (s) => s.get("keepGoing").eq(true), maxIterations: 1,
    }, (iteration) => iteration.task("expression-method", {
      input: iteration.input.get("state"),
      run: (state) => {
        // @ts-expect-error runtime state fields are resolved values
        state.count.lt(2);
        return state;
      },
    }));
    // @ts-expect-error final state retains the resolved numeric field
    const wrong: FlowExpression<{ count: FlowExpression<number>; keepGoing: boolean }> = looped;
    f.loop("wrong-next-state", {
      initial: { count: f.input.get("count") }, input: null,
      while: (s) => s.get("count").lt(2), maxIterations: 1,
    // @ts-expect-error the body must return the resolved initial shape; it cannot widen state
    }, (iteration) => iteration.task("wrong", { input: null, run: () => ({ count: "text" }) }));
    return f.output("done", { mapped, wrong });
  });
}
