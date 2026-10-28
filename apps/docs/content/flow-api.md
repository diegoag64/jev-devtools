Use the flow builder to connect SDK requests, application tasks, and decisions on Node. This page explains how the operations compose and what their examples return. The [API glossary](@/api/reference/#flow-definitions-and-steps) has the full parameter and return tables. For your first definition, start with [Flows from scratch](@/guides/flow-basics/).

## defineJevFlow(name, build)

Import from `jev-devtools/flow` in Node code. [`defineJevFlow<Input>()`](@/api/reference/#definejevflow) accepts a name and a synchronous builder callback, and returns a definition with [`run(input, options)`](@/api/reference/#flow-run). The callback returns [`flow.output()`](@/api/reference/#flow-output) or a terminal [`flow.branch()`](@/api/reference/#flow-branch).

`flow.jev()` creates future-answer references synchronously. The `await triage.run(...)` call inside `routeMessage()` performs the request and waits for the outcome. Call `await routeMessage("I was charged twice.")` from your Node handler.

<!-- example: flow.ts -->

`classify` asks Jev which team should handle the message. The branch compares the returned Choice label with `"billing"` and returns one team name. `routeMessage()` supplies the message, instrumented client, and shared inspector, then awaits the outcome. The selected team depends on the SDK response.

### Definition and run interfaces

| Value / member               | Type                                       | Description                                            |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `triage.definition`          | `FlowDefinition`                           | The static recipe graph.                               |
| `triage.run(input, options)` | `Promise<FlowOutcome & { runId: string }>` | Executes the recipe and resolves to the fields below.  |
| `runId`                      | `string`                                   | Unique execution ID.                                   |
| `outcome`                    | `string`                                   | `"billing-team"` or `"support-team"` for this example. |
| `value?`                     | `unknown`                                  | Optional output data; omitted by this example.         |

[`run`](@/api/reference/#flow-run) accepts a required `client` with `systemOne`, optional `devtools: FlowObserver`, and optional `signal: AbortSignal`. It resolves to `{ runId, outcome, value? }`. `definition` exposes the static graph for inspection. Definitions make no SDK calls.

## Inferred application results

Use `defineJevFlow<Input>(name)(build)` to specify the input and infer a discriminated union of terminal names and values. The extra call lets TypeScript infer the result after fixing the input type. The existing `defineJevFlow<Input>(name, build)` form retains its broad `FlowOutcome` result for compatibility. Without explicit type arguments, the two-argument form also infers terminal results.

<!-- example: flow-branch.ts -->

`route.run()` returns either `"manual-review"` with a string or `"ready"` with a number. `tryBranch()` narrows the result by its outcome before using its value. Nested object and array output templates resolve references in the returned type. Dynamic names remain `string`, and broad return annotations can widen inferred results.

`DefinedJevFlow<Input, Outcome>` and `FlowResult<Outcome>` name executable definitions and application results. They default to `FlowOutcome` for helpers that accept any outcome. Captured `FlowRun` values retain their separate, potentially redacted shape.

## Requests and function steps

| Method                                                                         | Arguments and result                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`jev(id, request, display?)`](@/api/reference/#flow-jev)                      | A regular SDK request whose state can contain expressions. Returns [`.answer(name)`](@/api/reference/#request-answer) field references and [`.answers`](@/api/reference/#request-answers). |
| [`jev(id, { input, request }, display?)`](@/api/reference/#flow-jev)           | Resolve input, then synchronously construct an SDK request in the factory. Use a preceding task for async work.                                                                            |
| [`task(id, { input, run, timeoutMs? }, display?)`](@/api/reference/#flow-task) | Resolve nested input references and execute application code. Returns a typed expression for the result.                                                                                   |

[`run`](@/api/reference/#flow-task) on a task receives `(resolvedInput, context)`. [`TaskContext`](@/api/reference/#type-taskcontext) contains `signal`, `runId`, `stepId`, and `executionId`. Respond to the signal for cooperative cancellation. Timeouts cannot undo side effects or forcibly stop non-cooperating code. Tasks do not retry automatically.

`display` is optional static `{ title?, description? }` metadata. Keep it public-safe. Use [`.answers`](@/api/reference/#request-answers) when question keys are generated dynamically; individual [`.answer(name)`](@/api/reference/#request-answer) references require the named question to exist at execution.

### Return interfaces

| Method / member         | Type                                  | Description                                                         |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `jev(...).answer(name)` | Object of typed field expressions     | References to the selected question's SDK result fields.            |
| `jev(...).answers`      | `FlowExpression` of the answer object | Reference to all answers. Both Jev overloads return this interface. |
| `task(...)`             | `FlowExpression<Awaited<O>>`          | Reference to the application callback's awaited result.             |

## Decisions and outcomes

| Method                                                                       | Behavior                                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`branch(id, { when, then, else }, display?)`](@/api/reference/#flow-branch) | Terminal decision. Both paths must return [`output()`](@/api/reference/#flow-output) or another terminal branch. |
| [`if(id, { when, then, else }, display?)`](@/api/reference/#flow-if)         | Return a typed value from one path, then continue shared work.                                                   |
| [`output(name, value?, display?)`](@/api/reference/#flow-output)             | Finish with a named outcome and optional resolved value. Does not execute a business action.                     |

Both path callbacks run during definition to describe the possible steps. During execution, the runner selects one path using the resolved condition.

Use [flow expressions](@/api/expressions/) for that condition. A JavaScript `if` on a reference runs during definition and cannot select work based on its future value.

### Return interfaces

| Method        | Type                                                        | Description                                                              |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `branch(...)` | `FlowExpression<A \| B>`                                    | Union of terminal results from both paths.                               |
| `if(...)`     | `FlowExpression<A \| B>`                                    | Selected value, available to shared steps after the join.                |
| `output(...)` | `FlowExpression<{ outcome: Name; value: Resolved<Value> }>` | Literal outcome name and resolved value; omitted values are `undefined`. |

Value bodies receive `FlowValueBuilder` and cannot call `output()` or `branch()` directly. Roots, terminal branch paths, and parallel lanes receive `FlowBuilder`. Collection scope propagates through nested paths and lanes: map descendants cannot create maps or loops; loop descendants cannot create loops but can create maps. Let callback types infer these capabilities. Shared helpers should accept only the methods they use.

## Parallel lanes

[`parallel(id, lanes, display?)`](@/api/reference/#flow-parallel) takes a named object of lane callbacks. Each lane returns an expression. The result is an object of joined expressions with matching names. Work inside a lane is sequential; lanes are concurrent. A sibling lane's private intermediate references are not available to other lanes.

<!-- example: flow-join.ts -->

`tryJoin()` starts a run and waits for both lanes. The left lane doubles `2`, and the right lane triples `3`. `output()` resolves their joined references to `{ left: 4, right: 9 }`. Neither lane reads the other's private steps.

| Returned member | Type                     | Resolved value in this example |
| --------------- | ------------------------ | ------------------------------ |
| `results.left`  | `FlowExpression<number>` | `4`.                           |
| `results.right` | `FlowExpression<number>` | `9`.                           |

The builder describes both lanes synchronously; the task callbacks run when `tryJoin()` awaits execution. For a request-based example, see the [full flow guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md#parallel-calls-and-the-join).

## Collections and loops

[`map()`](@/api/reference/#flow-map) executes an item program for each array item. Results stay in input order even when items finish out of order. Set `maxItems` to bound the array size and `concurrency` to limit simultaneous item programs.

The item builder receives `{ item, index, context }`. Pass shared context through the `input` option. Whole-array references and scalar arrays preserve `Item`; nested reference templates resolve each item to `Resolved<Item>`.

[`loop()`](@/api/reference/#flow-loop) tests a state condition before each iteration. Its builder receives `{ state, index, context }` and must return the next state. Whole-state references and scalars preserve `State`; initial templates resolve nested references to `Resolved<State>`.

When the condition becomes false, the loop returns the current state. If the condition remains true at `maxIterations`, it rejects with [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror). The error identifies the failing loop in `stepId` and its message. It does not return a successful partial result.

Call `tryOperations()` from Node to run both definitions below. Its two `await` calls execute application-owned tasks without inference and read the resolved results:

<!-- example: operations.ts -->

`tryOperations()` runs two definitions:

- `summarize` doubles `[2, 4]` with `map()`, adds the results in a task, and uses `if()` to choose a label. `all()` and `not()` express the label policy. The result is outcome `"summary"` with value `{ total: 12, label: "Large: 12" }`.
- `count` carries `{ value, target }` through a loop, incrementing `value` until it reaches `target`. With target `3`, the result is outcome `"counted"` with value `{ value: 3, target: 3 }`. The initial template contains a target reference, which resolves before the condition and task use it.

| Method      | Return type                                                                                                 | Resolved value                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `map(...)`  | `FlowExpression<Output[]>`                                                                                  | Item results in input order.                                |
| `loop(...)` | `FlowExpression<State>` for whole-state references/scalars; `FlowExpression<Resolved<State>>` for templates | Final state when its pre-iteration condition becomes false. |

A loop can contain a map. Nested maps, nested loops, and loops inside maps are unsupported. Shared context is explicit; use `context` inside map/loop item programs rather than reaching across scope boundaries.

## Limits and errors

Node IDs must be unique across the whole definition, including untaken branches and parallel lanes. Output names are node IDs too. Use 1–80 letters, digits, `_`, or `-`, starting with a letter or digit.

The limits apply at different levels:

| Level        | Limit                                          |
| ------------ | ---------------------------------------------- |
| Definition   | 256 nodes and 16 nested blocks                 |
| Run          | 1,024 expanded nodes                           |
| Map          | `maxItems` 1–64; `concurrency` 1–16, default 4 |
| Loop         | `maxIterations` 1–64                           |
| Task timeout | Integer `timeoutMs` from 1 to 2,147,483,647    |

**0.5.2:** each expression is limited to depth 80 and 4,096 expanded nodes, counting reused children at every occurrence; an operation accepts at most 256 operands. These limits apply during construction, including composition. Legacy condition text is capped at 4,096 UTF-16 code units with an explicit truncation suffix; execution retains the full accepted expression. See [expression limits](@/api/expressions/#expression-limits).

Structural errors fail during definition. Direct `output()` and terminal `branch()` calls in map bodies, loop bodies, and `if()` paths report the containing step, body or path, and operation. Return a value expression instead. Parallel lanes still accept terminal outputs and branches as lane values, including lanes inside these bodies. The shared builder type still permits some unsupported calls; definition construction checks them. Missing input values and invalid comparisons fail when execution reaches them. [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror) is exported for bounded-loop handling. For exact collection/concurrency/timeout limits, execution errors, and cancellation behavior, consult the [detailed guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md) and installed declarations.

<a id="replay-captured-answers-unreleased"></a>

## Replay captured answers

Since **0.5.0**, [`replayClient(fixture)`](@/api/reference/#replayclient) supplies stored Jev answers to a flow run. It needs no API key or inference-service connection. Application tasks still execute.

Call `await replayExample()` from Node. The definition is synchronous; `await flow.run(...)` executes it using the stored response.

<!-- example: replay.ts -->

The fixture stores a response for `classify`. `replayClient()` supplies it when that step executes, so the Choice reference resolves to `"billing"`. `replayExample()` returns outcome `"routed"` with value `"billing"`, without inference.

| API                     | Return type                  | Description                                                   |
| ----------------------- | ---------------------------- | ------------------------------------------------------------- |
| `replayClient(fixture)` | `TypeSafeClient`             | Client that supplies saved answers inside a flow run.         |
| `replayExample()`       | Promise of a flow run result | Resolves to `{ runId, outcome: "routed", value: "billing" }`. |

A [`FlowFixture`](@/api/reference/#type-flowfixture) contains `{ version: 1, flow, steps }`. It contains responses, not the original input or flow implementation. Replay checks the flow name, step IDs, and requested question names; it does not validate prompts or state. Missing responses reject rather than calling live inference. Map/loop steps use composed IDs such as `rounds/0/batch/1/assess`.

Tasks and request factories execute again. A task can still perform external calls or side effects, so use controlled tasks when replaying in tests. Failed or cancelled captures are partial fixtures, not replays of recorded failures. See the [replay guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md#replay-a-run-in-tests) for fixture copying and the repository CLI.

<a id="build-a-fixture-unreleased"></a>

## Build a fixture

Available since **0.5.0**.

[`flowFixture(definition, run, traces)`](@/api/reference/#flowfixture) is available from both `jev-devtools` and `jev-devtools/flow`. Pass the captured flow definition/run and a `ReadonlyMap<string, Trace>` indexed by trace ID. It returns a [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture) with `{ fixture, missing, warnings }`.

Check `missing` for completed steps whose response was unavailable, and `warnings` for capture limitations before saving `fixture` as JSON. Server redaction and truncation remain in the fixture. The drawer's **Copy fixture** also applies its current display masking; calling this helper directly does not add display masking.

### Return interface

| Property   | Type          | Description                                               |
| ---------- | ------------- | --------------------------------------------------------- |
| `fixture`  | `FlowFixture` | Captured response bodies indexed by step ID.              |
| `missing`  | `string[]`    | Completed steps whose response captures were unavailable. |
| `warnings` | `string[]`    | Capture limitations to inspect before saving.             |

## Related types

[`FlowBuilder`](@/api/reference/#type-flowbuilder), [`FlowValueBuilder`](@/api/reference/#type-flowvaluebuilder), [`DefinedJevFlow`](@/api/reference/#type-definedjevflow), [`FlowResult`](@/api/reference/#type-flowresult), [`FlowRunOptions`](@/api/reference/#type-flowrunoptions), [`FlowOutcome`](@/api/reference/#type-flowoutcome), [`FlowTask`](@/api/reference/#type-flowtask), [`FlowRequestFactory`](@/api/reference/#type-flowrequestfactory), [`TaskContext`](@/api/reference/#type-taskcontext), and [`Resolved`](@/api/reference/#type-resolved) describe builder and execution contracts. [`FlowDefinition`](@/api/reference/#type-flowdefinition), [`FlowRun`](@/api/reference/#type-flowrun), [`FlowStep`](@/api/reference/#type-flowstep), [`FlowDisplay`](@/api/reference/#type-flowdisplay), and [`FlowObserver`](@/api/reference/#type-flowobserver) describe inspection data and callbacks. [`FlowFixture`](@/api/reference/#type-flowfixture) and [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture) describe replay data (new in 0.5.0). See [recorder and types](@/api/recorder/).

<a id="compare-a-fixture-with-a-live-run-unreleased"></a>

## Compare a fixture with a live run

Available since **0.5.0**.

[`compareWithFixture()`](@/api/reference/#comparewithfixture) runs the same definition and input twice: first with saved answers, then with your supplied client. A live client makes inference calls during the second run. [`formatComparison()`](@/api/reference/#formatcomparison) returns a text summary of the differences.

```ts
import { compareWithFixture, formatComparison } from "jev-devtools/flow";

// program, input, fixture, client, and inspector come from your app.
const comparison = await compareWithFixture(program, input, fixture, {
  client,
  devtools: inspector,
  tolerance: 0.01,
});
console.log(formatComparison(comparison));
```

The comparison uses the same `program` and `input` for both executions. `tolerance: 0.01` permits small numeric answer-field differences. `formatComparison()` returns text, and `console.log()` prints it.

| Value / member                 | Type                         | Description                                                                           |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------- |
| `compareWithFixture(...)`      | `Promise<FixtureComparison>` | Resolves to outcome, value, decisions, answers, step differences, and a live fixture. |
| `comparison.changed`           | `boolean`                    | Outcome, value, decision, or executed Jev-step differences.                           |
| `comparison.answers`           | `AnswerChange[]`             | Individual scalar answer-field comparisons.                                           |
| `comparison.liveFixture`       | `FlowFixture`                | Unredacted, untruncated live response bodies.                                         |
| `formatComparison(comparison)` | `string`                     | Plain-text description of changes.                                                    |

Read `changed` and `answers` separately. The top-level flag tracks differences in outcome, value, decisions, and executed Jev steps. Answer drift alone does not set it. Numeric tolerance applies only to individual answer fields.

Tasks execute on both sides, so use controlled, repeatable tasks. Neither execution undoes side effects. `liveFixture` contains unredacted, untruncated responses from the supplied client. Review it before saving or sharing.

See [`FixtureComparison`](@/api/reference/#type-fixturecomparison) for every output field and the [comparison contract](@/api/reference/#comparewithfixture) for errors and cancellation.
