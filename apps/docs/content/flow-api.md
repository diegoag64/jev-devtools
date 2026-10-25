## defineJevFlow(name, build)

Import from `jev-devtools/flow` in Node code. `defineJevFlow<Input>()` accepts a name and a synchronous builder callback, and returns a definition with `run(input, options)`. The callback returns `flow.output()` or a terminal `flow.branch()`.

<!-- example: flow.ts -->

`run` accepts a required `client` with `systemOne`, optional `devtools: FlowObserver`, and optional `signal: AbortSignal`. It resolves to `{ runId, outcome, value? }`. `definition` exposes the static graph for inspection. Definitions make no SDK calls.

## Requests and function steps

| Method                                           | Arguments and result                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `jev(id, request, display?)`                     | A regular SDK request whose state can contain expressions. Returns `.answer(name)` field references and `.answers`. |
| `jev(id, { input, request }, display?)`          | Resolve input, then synchronously construct an SDK request in the factory. Use a preceding task for async work.     |
| `task(id, { input, run, timeoutMs? }, display?)` | Resolve nested input references and execute application code. Returns a typed expression for the result.            |

`run` on a task receives `(resolvedInput, context)`. `TaskContext` contains `signal`, `runId`, `stepId`, and `executionId`. Respond to the signal for cooperative cancellation. Timeouts cannot undo side effects or forcibly stop non-cooperating code. Tasks do not retry automatically.

`display` is optional static `{ title?, description? }` metadata. Keep it public-safe. Use `.answers` when question keys are generated dynamically; individual `.answer(name)` references require the named question to exist at execution.

## Decisions and outcomes

| Method                                       | Behavior                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `branch(id, { when, then, else }, display?)` | Terminal decision. Both paths must return `output()` or another terminal branch.             |
| `if(id, { when, then, else }, display?)`     | Return a typed value from one path, then continue shared work.                               |
| `output(name, value?, display?)`             | Finish with a named outcome and optional resolved value. Does not execute a business action. |

Path callbacks build both possible paths synchronously; only the selected path executes. Conditions use [inspectable expressions](@/api/expressions/). You cannot use a JavaScript `if` on an expression to select runtime work.

## Parallel lanes

`parallel(id, lanes, display?)` takes a named object of lane callbacks. Each lane returns an expression. The result is an object of joined expressions with matching names. Work inside a lane is sequential; lanes are concurrent. A sibling lane's private intermediate references are not available to other lanes.

```ts
const results = flow.parallel("load", {
  left: (lane) => lane.task("left-value", { input: 2, run: (n) => n * 2 }),
  right: (lane) => lane.task("right-value", { input: 3, run: (n) => n * 3 }),
});
return flow.output("joined", { left: results.left, right: results.right });
```

This fragment belongs inside a `defineJevFlow()` callback. For a complete request-based example, see the [full flow guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md#parallel-calls-and-the-join).

## Collections and loops

`map(id, { items, input, maxItems, concurrency? }, build, display?)` executes one bounded item program per item and returns results in input order. Its builder input is `{ item, index, context }`. The `input` option supplies explicit shared context.

`loop(id, { initial, input, while, maxIterations }, build, display?)` tests the state condition before each iteration. Its builder input is `{ state, index, context }`; return the next state. It returns the final state after the condition becomes false. If the condition still holds at the iteration limit, it throws `FlowLoopLimitError`.

These complete definitions demonstrate application-owned tasks without inference:

<!-- example: operations.ts -->

A loop can contain a map. Nested maps, nested loops, and loops inside maps are unsupported. Shared context is explicit; use `context` inside map/loop item programs rather than reaching across scope boundaries.

## Limits and errors

IDs must be unique across the whole definition, including untaken branches and lanes: 1–80 letters, digits, `_`, or `-`, starting with a letter or digit. Output names are node IDs too. Definitions allow 256 nodes, 16 nested blocks, and a run-wide budget of 1,024 expanded nodes.

Structural errors fail during definition. Missing input values and invalid comparisons fail when execution reaches them. `FlowLoopLimitError` is exported for bounded-loop handling. For exact collection/concurrency/timeout limits, execution errors, and cancellation behavior, consult the [detailed guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md) and installed declarations.

## Related types

`FlowBuilder`, `FlowRunOptions`, `FlowOutcome`, `FlowTask`, `FlowRequestFactory`, `TaskContext`, and `Resolved` describe builder and execution contracts. `FlowDefinition`, `FlowRun`, `FlowStep`, `FlowDisplay`, and `FlowObserver` describe inspection data and callbacks. See [recorder and types](@/api/recorder/).
