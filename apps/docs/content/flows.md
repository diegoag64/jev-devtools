New to flows? Start with [Flows from scratch](@/guides/flow-basics/), which introduces each method with a small example. For exact inputs and return values, use the [API glossary](@/api/reference/).

Flows are optional. Start here once a single request appears in the drawer. Keep all `jev-devtools/flow` imports on Node.

## Define first, run later

This flow classifies a message and returns the name of a team. It does not send a ticket or perform a business action.

Hover, focus, or tap a dotted API method or option for a short explanation. Try [`jev`](@/api/reference/#flow-jev), [`branch`](@/api/reference/#flow-branch), or `state`. Local variables and example-specific names stay plain code. Press Escape to dismiss the tooltip.

<!-- example: flow.ts twoslash -->

The `triage` definition is built once. `routeMessage()` runs it with new input each time. Pass the shared adapter as `devtools` to record the execution and link request traces to steps.

## Read the returned outcome

[`run()`](@/api/reference/#flow-run) resolves to `{ runId, outcome, value? }`. In this example, `outcome` is `billing-team` or `support-team`. Your application decides what to do with it. The return value is not inferred as a discriminated union; narrow `value` in application code when needed.

## Choose the right operation

| If you need to…                         | Use               |
| --------------------------------------- | ----------------- |
| Ask Jev one or more questions           | [`flow.jev()`](@/api/reference/#flow-jev)      |
| Run application code or await a service | [`flow.task()`](@/api/reference/#flow-task)     |
| Select a path and finish the flow       | [`flow.branch()`](@/api/reference/#flow-branch)   |
| Select a value and continue             | [`flow.if()`](@/api/reference/#flow-if)       |
| Run independent lanes and join          | [`flow.parallel()`](@/api/reference/#flow-parallel) |
| Process a bounded collection            | [`flow.map()`](@/api/reference/#flow-map)      |
| Repeat while a state condition holds    | [`flow.loop()`](@/api/reference/#flow-loop)     |
| Return a named result                   | [`flow.output()`](@/api/reference/#flow-output)   |

See the [flow builder reference](@/api/flow/) for options and boundaries, and [expressions](@/api/expressions/) for conditions.

## Keep decisions explicit

A returned Choice is used directly. If you introduce thresholds for Noul or Score results, those are application policies. Put them in the flow definition and explain them to readers. A Noul is a probability of true, not a confidence score.

## Handle failure and cancellation

Pass an `AbortSignal` through [`run(input, { client, devtools, signal })`](@/api/reference/#flow-run). SDK cancellation propagates to requests. Tasks receive a signal and should cooperate with cancellation. Tasks do not get automatic retries, rollback, or durable execution.

A loop that still needs to continue after its limit rejects with [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror); it does not return a successful partial result. Consult the [full flow guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md) for error propagation, parallel cancellation, and advanced examples.
