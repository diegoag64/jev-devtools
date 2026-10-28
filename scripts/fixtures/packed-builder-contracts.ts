// Compiled against the installed archive, then executed through public exports.
import assert from "node:assert/strict";
import {
  defineJevFlow,
  type ComparableFlow,
  type DefinedJevFlow,
  type FlowBuilder,
  type FlowOutcome,
  type FlowResult,
  type FlowRunOptions,
  type FlowValueBuilder,
} from "jev-devtools/flow";

const options: FlowRunOptions = {
  client: {
    systemOne() {
      throw new Error("Unexpected inference");
    },
  },
};
type Ticket = { amount: number; approved: boolean };
// A Node handler can discriminate the response without casts or parsing captures.
const review = defineJevFlow<Ticket>("typed-review")((f) =>
  f.branch("route", {
    when: f.input.get("approved"),
    then: (p) =>
      p.output("approved", {
        totals: [p.input.get("amount")],
        ticket: p.input,
      }),
    else: (p) =>
      p.branch("rejection", {
        when: p.input.get("amount").gt(0),
        then: (q) => q.output("rejected", q.input.get("amount")),
        else: (q) => q.output("empty"),
      }),
  }),
);
async function respond(ticket: Ticket) {
  const result = await review.run(ticket, options);
  const id: string = result.runId;
  if (result.outcome === "approved") {
    const amount: number = result.value.totals[0];
    assert.equal(result.value.ticket.amount, amount);
    return `${id}:${amount.toFixed(2)}`;
  }
  if (result.outcome === "rejected") return result.value.toFixed(2);
  const empty: undefined = result.value;
  return empty;
}
assert.match((await respond({ amount: 12, approved: true }))!, /:12\.00$/);
assert.equal(await respond({ amount: 12, approved: false }), "12.00");
assert.equal(await respond({ amount: 0, approved: false }), undefined);

// Application helpers can name an executable flow without inspecting private types.
function execute<T, O extends FlowOutcome>(
  flow: DefinedJevFlow<T, O>,
  input: T,
): Promise<FlowResult<O>> {
  return flow.run(input, options);
}
const inferred = defineJevFlow("inferred", (f) => f.output("count", 42));
const count = await execute(inferred, null);
const countName: "count" = count.outcome;
assert.equal(count.value.toFixed(0), "42");
assert.equal(countName, "count");
const compatible: ComparableFlow<Ticket> = review;
const broad: DefinedJevFlow<Ticket> = review;
void [compatible, broad];
const legacy = defineJevFlow<Ticket>("legacy", (f) =>
  f.output("done", f.input),
);
function legacyConsumer(result: Awaited<ReturnType<typeof legacy.run>>) {
  // @ts-expect-error existing explicit-input calls keep the broad outcome type
  const literal: "done" = result.outcome;
  // @ts-expect-error existing explicit-input calls keep value unknown
  result.value.amount;
  return literal;
}
void legacyConsumer;

function invalidOutcomes(result: Awaited<ReturnType<typeof review.run>>) {
  if (result.outcome === "rejected") {
    // @ts-expect-error branch discrimination preserves number versus object
    result.value.totals;
  }
  // @ts-expect-error the inferred outcome set is closed
  const impossible: "other" = result.outcome;
  // @ts-expect-error explicit input still constrains run callers
  review.run({ amount: "12", approved: true }, options);
  return impossible;
}
void invalidOutcomes;

// Shared helpers request only the operations legal in every value scope.
function lanes<T>(b: FlowValueBuilder<T, "map">) {
  const when = b.task("predicate", { input: true, run: (v) => v });
  return b.parallel("lanes", {
    direct: (lane) => lane.output("lane-value", { n: 7 }),
    branch: (lane) =>
      lane.branch("lane-route", {
        when,
        then: (p) => p.output("yes", 2),
        else: (p) => p.output("no", "three"),
      }),
    ordinary: (lane) => lane.task("ordinary", { input: 4, run: (n) => n * 2 }),
  });
}
// Root if -> loop -> if -> parallel -> branch -> map -> if -> parallel.
// This covers allowed transitions, with both conditional paths executed below.
const nested = defineJevFlow<boolean>("nested-capabilities")((f) => {
  const picked = f.if("root-if", {
    when: f.input,
    then: (p) =>
      p.loop(
        "rounds",
        {
          initial: 0,
          input: null,
          while: (s) => s.lt(1),
          maxIterations: 1,
        },
        (r) => {
          const inner = r.if("iteration-if", {
            when: r.input.get("state").eq(0),
            then: (p) => {
              const joined = p.parallel("iteration-lanes", {
                terminal: (lane) =>
                  lane.branch("iteration-route", {
                    when: lane.input.get("state").eq(0),
                    then: (branch) => {
                      const items = branch.map(
                        "items",
                        {
                          items: [1, 2],
                          input: { limit: branch.input.get("state") },
                          maxItems: 2,
                        },
                        (item) => {
                          const selected = item.if("item-if", {
                            when: item.input.get("item").eq(1),
                            then: (path) => lanes(path).direct,
                            else: (path) =>
                              path.parallel("else-lanes", {
                                terminal: (lane) =>
                                  lane.output("other-lane", { n: 9 }),
                              }).terminal,
                          });
                          return item.task("item-value", {
                            input: { selected, item: item.input },
                            run: ({ selected, item }) =>
                              selected.value.n + item.context.limit,
                          });
                        },
                      );
                      return branch.output("mapped", items);
                    },
                    else: (branch) => branch.output("unused", [0]),
                  }),
                value: (lane) =>
                  lane.task("sibling", { input: 1, run: (n) => n }),
              });
              return p.task("next", {
                input: joined.terminal,
                run: (result) => {
                  assert.deepEqual(result.value, [7, 9]);
                  return 1;
                },
              });
            },
            else: (p) => p.input.get("state"),
          });
          return inner;
        },
      ),
    else: (p) => {
      const joined = lanes(p);
      return p.task("from-lane", {
        input: joined.branch,
        run: (value) =>
          value.outcome === "yes" ? value.value : value.value.length,
      });
    },
  });
  return f.output("finished", picked);
});
assert.equal((await nested.run(true, options)).value.toFixed(0), "1");
assert.equal((await nested.run(false, options)).value, 2);

// Whole references, nested templates, readonly tuples, and scalar brands survive output inference.
type Dollars = number & { readonly currency: unique symbol };
const dollars = 3 as Dollars;
const branded = defineJevFlow<{ amount: Dollars; values: readonly Dollars[] }>(
  "brands",
)((f) => {
  const mapped = f.map(
    "amounts",
    { items: f.input.get("values"), input: null, maxItems: 2 },
    (item) => item.input.get("item"),
  );
  const state = f.loop(
    "retain",
    {
      initial: f.input.get("amount"),
      input: null,
      while: (s) => s.lt(0),
      maxIterations: 1,
    },
    (r) => r.input.get("state"),
  );
  return f.output("money", {
    state,
    mapped,
    pair: [f.input.get("amount"), "usd"] as const,
  });
});
const money = await branded.run(
  { amount: dollars, values: [dollars] },
  options,
);
const preserved: Dollars = money.value.state;
const tuple: readonly [Dollars, "usd"] = money.value.pair;
assert.deepEqual(money.value, { state: 3, mapped: [3], pair: [3, "usd"] });
void [preserved, tuple];
const noValue = defineJevFlow("no-value", (f) =>
  f.output("done", undefined, { title: "Done" }),
);
const absent: undefined = (await noValue.run(null, options)).value;
assert.equal(absent, undefined);

const dynamicName: string = "dynamic";
const dynamic = defineJevFlow("dynamic-name", (f) =>
  f.output(dynamicName, [1, 2]),
);
const dynamicResult = await dynamic.run(null, options);
assert.equal(
  dynamicResult.value.reduce((sum, n) => sum + n, 0),
  3,
);
function dynamicConsumer(result: typeof dynamicResult) {
  // @ts-expect-error a runtime string name cannot become a literal discriminant
  const name: "dynamic" = result.outcome;
  return name;
}
void dynamicConsumer;

// Never execute these invalid definitions. Unused expect-error directives fail
// when declarations accidentally grant capabilities the runtime rejects.
function invalidScopes(f: FlowBuilder<boolean>) {
  f.map("map", { items: [1], input: null, maxItems: 1 }, (item) => {
    // @ts-expect-error map bodies return values
    item.output("bad");
    // @ts-expect-error map bodies cannot terminate with branch
    item.branch;
    // @ts-expect-error nested maps are unsupported
    item.map;
    // @ts-expect-error loops inside maps are unsupported
    item.loop;
    item.if("nested-if", {
      when: item.input.get("item").gt(0),
      then: (path) => {
        // @ts-expect-error map restriction follows if paths
        path.map;
        // @ts-expect-error map restriction follows if paths
        path.loop;
        return path.input;
      },
      else: (path) => path.input,
    });
    const joined = item.parallel("nested-lanes", {
      terminal: (lane) => {
        // @ts-expect-error map restriction follows lanes
        lane.map;
        // @ts-expect-error map restriction follows lanes
        lane.loop;
        return lane.branch("branch", {
          when: lane.input.get("item").gt(0),
          then: (path) => {
            // @ts-expect-error map restriction follows lane branches
            path.map;
            // @ts-expect-error map restriction follows lane branches
            path.loop;
            return path.output("allowed", 1);
          },
          else: (path) => path.output("also-allowed", 2),
        });
      },
    });
    return joined.terminal;
  });
  f.loop(
    "loop",
    { initial: 0, input: null, while: (s) => s.lt(1), maxIterations: 1 },
    (r) => {
      // @ts-expect-error loop body cannot terminate, even when returning valid state later
      r.output("bad");
      // @ts-expect-error loop bodies cannot terminate with branch
      r.branch;
      // @ts-expect-error nested loops are unsupported
      r.loop;
      r.if("nested-if", {
        when: r.input.get("state").eq(0),
        then: (path) => {
          // @ts-expect-error loop restriction follows if paths
          path.loop;
          return path.input;
        },
        else: (path) => path.input,
      });
      r.parallel("nested-lanes", {
        terminal: (lane) => {
          // @ts-expect-error loop restriction follows lanes
          lane.loop;
          return lane.branch("nested-branch", {
            when: lane.input.get("state").eq(0),
            then: (path) => {
              // @ts-expect-error loop restriction follows lane branches
              path.loop;
              return path.output("allowed");
            },
            else: (path) => path.output("also-allowed"),
          });
        },
      });
      return r.input.get("state");
    },
  );
  f.if("if", {
    when: f.input,
    then: (path) => {
      // @ts-expect-error if paths return values
      path.output("bad");
      // @ts-expect-error if paths cannot terminate with branch
      path.branch;
      return path.input;
    },
    else: (path) => path.input,
  });
}
void invalidScopes;
console.log("Packed scope capabilities and inferred outcomes: passed");
