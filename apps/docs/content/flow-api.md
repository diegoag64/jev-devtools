New to flows? Start with [Flows from scratch](@/guides/flow-basics/), which introduces each method with a small example. For exact inputs and return values, use the [API glossary](@/api/reference/).

## defineJevFlow(name, build)

Import from `jev-devtools/flow` in Node code. [`defineJevFlow<Input>()`](@/api/reference/#definejevflow) accepts a name and a synchronous builder callback, and returns a definition with [`run(input, options)`](@/api/reference/#flow-run). The callback returns [`flow.output()`](@/api/reference/#flow-output) or a terminal [`flow.branch()`](@/api/reference/#flow-branch).

<!-- example: flow.ts -->

**Example walkthrough:** the `classify` Jev step asks which team should handle the message. `.answer("team").choice.eq("billing")` turns that answer into a branch condition. Each path returns a terminal team name. `routeMessage()` executes the recipe with the instrumented client and shared inspector.

### Definition and run interfaces

| Value / member | Type | Description |
| --- | --- | --- |
| `triage.definition` | `FlowDefinition` | The static recipe graph. |
| `triage.run(input, options)` | `Promise<FlowOutcome & { runId: string }>` | Executes the recipe and resolves to the fields below. |
| `runId` | `string` | Unique execution ID. |
| `outcome` | `string` | `"billing-team"` or `"support-team"` for this example. |
| `value?` | `unknown` | Optional output data; omitted by this example. |


[`run`](@/api/reference/#flow-run) accepts a required `client` with `systemOne`, optional `devtools: FlowObserver`, and optional `signal: AbortSignal`. It resolves to `{ runId, outcome, value? }`. `definition` exposes the static graph for inspection. Definitions make no SDK calls.

## Requests and function steps

| Method                                           | Arguments and result                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`jev(id, request, display?)`](@/api/reference/#flow-jev)                     | A regular SDK request whose state can contain expressions. Returns [`.answer(name)`](@/api/reference/#request-answer) field references and [`.answers`](@/api/reference/#request-answers). |
| [`jev(id, { input, request }, display?)`](@/api/reference/#flow-jev)          | Resolve input, then synchronously construct an SDK request in the factory. Use a preceding task for async work.     |
| [`task(id, { input, run, timeoutMs? }, display?)`](@/api/reference/#flow-task) | Resolve nested input references and execute application code. Returns a typed expression for the result.            |

[`run`](@/api/reference/#flow-task) on a task receives `(resolvedInput, context)`. [`TaskContext`](@/api/reference/#type-taskcontext) contains `signal`, `runId`, `stepId`, and `executionId`. Respond to the signal for cooperative cancellation. Timeouts cannot undo side effects or forcibly stop non-cooperating code. Tasks do not retry automatically.

`display` is optional static `{ title?, description? }` metadata. Keep it public-safe. Use [`.answers`](@/api/reference/#request-answers) when question keys are generated dynamically; individual [`.answer(name)`](@/api/reference/#request-answer) references require the named question to exist at execution.

### Return interfaces

| Method / member | Type | Description |
| --- | --- | --- |
| `jev(...).answer(name)` | Object of typed field expressions | References to the selected question's SDK result fields. |
| `jev(...).answers` | `FlowExpression` of the answer object | Reference to all answers. Both Jev overloads return this interface. |
| `task(...)` | `FlowExpression<Awaited<O>>` | Reference to the application callback's awaited result. |

## Decisions and outcomes

| Method                                       | Behavior                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`branch(id, { when, then, else }, display?)`](@/api/reference/#flow-branch) | Terminal decision. Both paths must return [`output()`](@/api/reference/#flow-output) or another terminal branch.             |
| [`if(id, { when, then, else }, display?)`](@/api/reference/#flow-if)     | Return a typed value from one path, then continue shared work.                               |
| [`output(name, value?, display?)`](@/api/reference/#flow-output)             | Finish with a named outcome and optional resolved value. Does not execute a business action. |

Path callbacks build both possible paths synchronously; only the selected path executes. Conditions use [inspectable expressions](@/api/expressions/). You cannot use a JavaScript `if` on an expression to select runtime work.

### Return interfaces

| Method | Type | Description |
| --- | --- | --- |
| `branch(...)` | `FlowExpression<FlowOutcome>` | Terminal result of the selected path. |
| `if(...)` | `FlowExpression<A \| B>` | Selected value, available to shared steps after the join. |
| `output(...)` | `FlowExpression<FlowOutcome>` | Terminal outcome name and optional resolved value. |

## Parallel lanes

[`parallel(id, lanes, display?)`](@/api/reference/#flow-parallel) takes a named object of lane callbacks. Each lane returns an expression. The result is an object of joined expressions with matching names. Work inside a lane is sequential; lanes are concurrent. A sibling lane's private intermediate references are not available to other lanes.

```ts api=parallel
const results = flow.parallel("load", {
  left: (lane) => lane.task("left-value", { input: 2, run: (n) => n * 2 }),
  right: (lane) => lane.task("right-value", { input: 3, run: (n) => n * 3 }),
});
return flow.output("joined", { left: results.left, right: results.right });
```

**Example walkthrough:** the left lane doubles `2` and the right lane triples `3`. The joined references are passed into `output()`, producing `{ left: 4, right: 9 }`. The lane computations are independent; neither reads the other's private steps.

| Returned member | Type | Resolved value in this example |
| --- | --- | --- |
| `results.left` | `FlowExpression<number>` | `4`. |
| `results.right` | `FlowExpression<number>` | `9`. |

This fragment belongs inside a [`defineJevFlow()`](@/api/reference/#definejevflow) callback. For a complete request-based example, see the [full flow guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md#parallel-calls-and-the-join).

## Collections and loops

[`map(id, { items, input, maxItems, concurrency? }, build, display?)`](@/api/reference/#flow-map) executes one bounded item program per item and returns results in input order. Its builder input is `{ item, index, context }`. The `input` option supplies explicit shared context.

[`loop(id, { initial, input, while, maxIterations }, build, display?)`](@/api/reference/#flow-loop) tests the state condition before each iteration. Its builder input is `{ state, index, context }`; return the next state. It returns the final state after the condition becomes false. If the condition still holds at the iteration limit, it throws [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror).

These complete definitions demonstrate application-owned tasks without inference:

<!-- example: operations.ts -->

**Example walkthrough:** `summarize` uses `map()` to double each number, a task to add them, and `if()` to choose a label before returning the summary. `all()` and `not()` make the label policy explicit. With `[2, 4]`, the output is `{ total: 12, label: "Large: 12" }`. The separate `count` flow carries `{ value, target }` as loop state and increments `value` until it reaches the target.

| Method | Return type | Resolved value |
| --- | --- | --- |
| `map(...)` | `FlowExpression<Output[]>` | Item results in input order. |
| `loop(...)` | `FlowExpression<State>` | Final state when its pre-iteration condition becomes false. |


A loop can contain a map. Nested maps, nested loops, and loops inside maps are unsupported. Shared context is explicit; use `context` inside map/loop item programs rather than reaching across scope boundaries.

## Limits and errors

IDs must be unique across the whole definition, including untaken branches and lanes: 1–80 letters, digits, `_`, or `-`, starting with a letter or digit. Output names are node IDs too. Definitions allow 256 nodes, 16 nested blocks, and a run-wide budget of 1,024 expanded nodes.

Structural errors fail during definition. Missing input values and invalid comparisons fail when execution reaches them. [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror) is exported for bounded-loop handling. For exact collection/concurrency/timeout limits, execution errors, and cancellation behavior, consult the [detailed guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md) and installed declarations.

## Replay captured answers (unreleased)

[`replayClient(fixture)`](@/api/reference/#replayclient) returns an SDK-compatible client for a flow run. Jev steps receive stored answers without a network call or API key. This is not in npm 0.4.1 yet.

<!-- example: replay.ts -->

**Example walkthrough:** the fixture stores the response for the `classify` step. `replayClient()` supplies that response to the same flow, so the Choice expression resolves to `"billing"` without inference. The run returns outcome `"routed"` and value `"billing"`.

| API | Return type | Description |
| --- | --- | --- |
| `replayClient(fixture)` | `TypeSafeClient` | Client that supplies saved answers inside a flow run. |
| `replayExample()` | Promise of a flow run result | Resolves to `{ runId, outcome: "routed", value: "billing" }`. |


A [`FlowFixture`](@/api/reference/#type-flowfixture) contains `{ version: 1, flow, steps }`. It contains responses, not the original input or flow implementation. Replay checks the flow name, step IDs, and requested question names; it does not validate prompts or state. Missing responses reject rather than calling live inference. Map/loop steps use composed IDs such as `rounds/0/batch/1/assess`.

Tasks and request factories execute again. A task can still perform external calls or side effects, so use controlled tasks when replaying in tests. Failed or cancelled captures are partial fixtures, not replays of recorded failures. See the [replay guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md#replay-a-run-in-tests) for fixture copying and the repository CLI.

## Build a fixture (unreleased)

[`flowFixture(definition, run, traces)`](@/api/reference/#flowfixture) is available from both `jev-devtools` and `jev-devtools/flow`. Pass the captured flow definition/run and a `ReadonlyMap<string, Trace>` indexed by trace ID. It returns a [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture) with `{ fixture, missing, warnings }`.

Check `missing` for completed steps whose response was unavailable, and `warnings` for capture limitations before saving `fixture` as JSON. Server redaction and truncation remain in the fixture. The drawer's **Copy fixture** also applies its current display masking; calling this helper directly does not add display masking.

### Return interface

| Property | Type | Description |
| --- | --- | --- |
| `fixture` | `FlowFixture` | Captured response bodies indexed by step ID. |
| `missing` | `string[]` | Completed steps whose response captures were unavailable. |
| `warnings` | `string[]` | Capture limitations to inspect before saving. |

## Related types

[`FlowBuilder`](@/api/reference/#type-flowbuilder), [`FlowRunOptions`](@/api/reference/#type-flowrunoptions), [`FlowOutcome`](@/api/reference/#type-flowoutcome), [`FlowTask`](@/api/reference/#type-flowtask), [`FlowRequestFactory`](@/api/reference/#type-flowrequestfactory), [`TaskContext`](@/api/reference/#type-taskcontext), and [`Resolved`](@/api/reference/#type-resolved) describe builder and execution contracts. [`FlowDefinition`](@/api/reference/#type-flowdefinition), [`FlowRun`](@/api/reference/#type-flowrun), [`FlowStep`](@/api/reference/#type-flowstep), [`FlowDisplay`](@/api/reference/#type-flowdisplay), and [`FlowObserver`](@/api/reference/#type-flowobserver) describe inspection data and callbacks. [`FlowFixture`](@/api/reference/#type-flowfixture) and [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture) describe replay data (unreleased). See [recorder and types](@/api/recorder/).

## Compare a fixture with a live run (unreleased)

[`compareWithFixture`](@/api/reference/#comparewithfixture) runs the same recipe and input twice: first with saved answers, then with your supplied client. [`formatComparison`](@/api/reference/#formatcomparison) turns the result into readable text. This comparison performs live inference; ordinary [`replayClient`](@/api/reference/#replayclient) does not.

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

**Example walkthrough:** the comparison replays the stored answers, then runs with the supplied client using the same input. The tolerance applies to numeric answer-field differences. `formatComparison()` returns text, and the application's `console.log()` prints it.

| Value / member | Type | Description |
| --- | --- | --- |
| `compareWithFixture(...)` | `Promise<FixtureComparison>` | Resolves to outcome, value, decisions, answers, step differences, and a live fixture. |
| `comparison.changed` | `boolean` | Outcome, value, decision, or executed Jev-step differences. |
| `comparison.answers` | `AnswerChange[]` | Individual scalar answer-field comparisons. |
| `comparison.liveFixture` | `FlowFixture` | Unredacted, untruncated live response bodies. |
| `formatComparison(comparison)` | `string` | Plain-text description of changes. |

Tasks execute on both sides. Use controlled, repeatable tasks; neither replay nor comparison undoes side effects. Top-level `changed` tracks outcome, value, decisions, and executed Jev steps; answer drift alone does not set it. Inspect `answers` for individual field differences. Numeric tolerance only applies to those answer fields. The returned `liveFixture` contains unredacted live responses, so review it before saving or sharing.

See [`FixtureComparison`](@/api/reference/#type-fixturecomparison) for every output field and the [comparison contract](@/api/reference/#comparewithfixture) for errors and cancellation.
