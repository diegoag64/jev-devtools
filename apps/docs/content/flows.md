Build a flow that asks Jev to classify a support message, selects a team from the answer, and returns that team's name. You will be able to inspect the request and the selected path together in the drawer.

Before starting, connect the drawer with [Quick start](@/getting-started/) or the [Next.js guide](@/guides/nextjs/) and confirm that a single request appears. This example expects `server.ts` to export your shared `inspector` and its instrumented `jev` client. Keep all flow code on Node.

If flow definitions are new to you, [Flows from scratch](@/guides/flow-basics/) introduces them with a task that needs no API key. The request below uses your client's configured transport, which makes live inference calls unless you have supplied a sample transport.

<a id="define-first-run-later"></a>

## Define the routing flow

Save this example as `triage.ts` beside `server.ts`:

<!-- example: flow.ts twoslash -->

The definition has three parts:

1. `flow.jev("classify", ...)` supplies the input message as `state` and asks a Choice question with two labels: `billing` and `other`.
2. `classification.answer("team").choice.eq("billing")` references the chosen label and defines the routing condition.
3. `flow.branch("route", ...)` selects one path. Each path ends with `output()`, which names the outcome.

Creating `triage` builds these steps synchronously. The question is sent when `triage.run()` executes. Naming an outcome does not send a ticket or assign work to a team.

## Run and inspect it

Call `await routeMessage("I was charged twice.")` from your Node handler. The function awaits the execution and logs either `billing-team` or `support-team`, depending on the returned Choice.

Open the drawer and select the `triage` execution. Check that:

- The `classify` step has a linked request containing the message and `team` question.
- The selected route agrees with the returned label: `billing` leads to `billing-team`, and `other` leads to `support-team`.
- The execution ends with that named outcome.

Passing `devtools: inspector` records the flow, while the instrumented `jev` client captures its SDK request. Use the same adapter for both. If your app uses custom session scopes, run the handler inside [`inspector.run(request, callback)`](@/api/reference/#adapter-run) as well.

## Read the returned outcome

[`run()`](@/api/reference/#flow-run) resolves to an object with a unique `runId`, an `outcome` string, and an optional `value`. This example returns an outcome name without a value.

Use `result.outcome` in your application to decide what happens next. If another flow returns a value, its public type is `unknown`. Validate or narrow it before using it. The return type is not inferred as a discriminated union of the terminal paths.

## Keep decisions explicit

This example uses the SDK's chosen label directly. The application owns the rule that maps that label to a team.

If you add a threshold for a Noul or Score answer, put that policy in the definition so readers can see it. A Noul is a probability of true, not a confidence score. See [Expressions & conditions](@/api/expressions/) for composing those checks.

## Handle failure and cancellation

Await the run in your handler so it can handle rejected executions as well as successful outcomes. To cancel, pass an `AbortSignal` in the [`run()` options](@/api/reference/#flow-run). Cancellation propagates to SDK requests. Tasks receive a signal and must cooperate with cancellation.

Tasks do not have automatic retries, rollback, or durable execution. If you add side effects, your application must decide how to recover from a failure. See the [full flow reference](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md) for error propagation and parallel cancellation.

## Choose the right operation

Extend the flow when your application needs more steps:

| Task                                         | Operation                                           |
| -------------------------------------------- | --------------------------------------------------- |
| Call application code or await a service     | [`flow.task()`](@/api/reference/#flow-task)         |
| Select a value, then continue                | [`flow.if()`](@/api/reference/#flow-if)             |
| Run independent lanes and join their results | [`flow.parallel()`](@/api/reference/#flow-parallel) |
| Process a bounded collection                 | [`flow.map()`](@/api/reference/#flow-map)           |
| Repeat while a state condition holds         | [`flow.loop()`](@/api/reference/#flow-loop)         |

Loops require a limit. If a loop still needs to continue when it reaches that limit, it rejects with [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror) rather than returning a successful partial result. The [flow builder reference](@/api/flow/) covers the options and limits for each operation.
