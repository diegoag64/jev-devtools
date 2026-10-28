# Flow API design decisions

This record resolves the proposals in [#52](https://github.com/diegoag64/jev-devtools/issues/52). On a feature branch, these decisions await PR review. Merging the decision record completes that design review; [#143](https://github.com/diegoag64/jev-devtools/issues/143) tracks the remaining accepted implementation work.

## Baseline and completed work

Revalidated on main `45976b52f1247c88d4f6f21f3105555094b17a9b` on 2026-10-28 with Node 24.21.0. This is a compatibility decision, not a release announcement. The [changelog](../CHANGELOG.md) distinguishes merged work from published versions.

- [#132](https://github.com/diegoag64/jev-devtools/pull/132) identifies exhausted loops through `FlowLoopLimitError.stepId` and reports the context of invalid terminal calls. Parallel-lane terminals remain valid.
- [#140](https://github.com/diegoag64/jev-devtools/pull/140) adds scope-specific builders, inferred terminal names and values, and the `DefinedJevFlow` and `FlowResult` types. These additions remain Unreleased at this baseline. The curried `defineJevFlow<Input>(name)(build)` form permits inference after the explicit input type. Existing explicit-input two-argument calls keep their broad result for compatibility.

Both changes already have packed declaration and execution consumers. This decision retains their contracts, including the distinction between exact whole-expression outputs and potentially projected direct object templates. See the [Flow guide](flows.md#operations-and-references) for the current typing rules.

## Accept clearer lane-outcome labels

A lane's terminal output returns a value to the parallel join. It does not finish the containing flow. The public probe used a left lane returning `output("lane-done", 1)`, a right lane returning task value `2`, and a post-join task that adds them. The final output was `"flow-done"` with value `3`, and the post-join task completed.

React SSR of that completed run produced two identical **Returned outcome** labels. [`FlowOverview.tsx`](../packages/jev-devtools/src/FlowOverview.tsx) uses that label for every completed output node. The viewer lacks a visible distinction between a completed lane and a final flow outcome. This is a rendering observation, not a browser usability study.

Accept the focused viewer change in [#143](https://github.com/diegoag64/jev-devtools/issues/143), at Low priority. Its acceptance covers lane branches, lanes inside collection programs, root outputs, post-join work, and old captures. Use recorded scope to distinguish labels; retain neutral wording when scope is unavailable. Preserve execution and `output()` itself. The issue owns implementation details and browser verification.

## Defer a general error taxonomy and additional run context

The concrete loop-identity and definition-diagnostic problems are fixed by #132. A general taxonomy still needs an application consumer that must distinguish failures beyond the existing error classes and captured step status.

The runner rethrows the original rejection. The baseline probe preserved a frozen `Error` with its original `cause`, and also preserved an `undefined` rejection, with recording disabled. Wrapping every failure would change identity and `instanceof`; attaching context to the thrown value cannot handle frozen objects or primitives. An observer-based solution alone would not serve applications that run without recording.

Defer new error codes, wrappers, and a context-access API. Reconsider them when a concrete handler needs to classify or correlate a failure and cannot use its task context, the loop `stepId`, or existing observer metadata. That proposal must specify behavior without an observer and under concurrent runs, nested items, sibling cancellation, and SDK retries. It must preserve original rejection/cause identity and cancellation semantics, with public consumer tests.

Keep captured error fields limited to error names, as today. Messages, causes, stacks, inputs, and arbitrary properties must not become capture fields as a side effect of richer application errors. Names and structural IDs are not a place for secrets. Any future metadata change must follow the [capture boundaries](architecture.md#flow-capture-boundaries), including transport, viewers, and replay consumers.

## Defer a named adapter alias

Keep `ReturnType<typeof createJevDevtools>` for consumers that need to name the complete adapter. The [API reference](../apps/docs/content/reference.md) already defines `Adapter` as a reading aid, not an export. The server registry and repository test helpers use `ReturnType`; the audit found no concrete consumer blocked by it.

A public alias remains an additive convenience proposal. Reconsider it when an application integration or generic helper demonstrates a repeated typing problem that `ReturnType` or a narrow `Pick` does not address. Validate that example against packed public declarations before choosing a name. The executable-flow and result aliases accepted in #140 are separate and remain supported.

## Retain observer, recorder, and expression APIs

Reject restricting these exports as part of #52. The consumer audit covered `apps`, `cookbooks`, `examples`, `scripts/fixtures`, and package code/tests:

- [`compareWithFixture()`](../packages/jev-devtools/flow/compare.ts) composes a `FlowObserver` with the caller's observer. Observer tests protect SDK result/error identity, single invocation, and cancellation. Removing or narrowing this contract would affect a supported integration.
- [`apps/docs/examples/recorder.ts`](../apps/docs/examples/recorder.ts) and the [packed capture consumer](../scripts/fixtures/packed-capture.ts) instantiate `JevRecorder` through `jev-devtools/server`. It supports custom capture integrations without HTTP routes.
- The [packed expression consumer](../scripts/fixtures/packed-expression-contracts.ts) uses `FlowExpression` in generic helpers. The audit found no direct consumer construction of `new FlowExpression` outside its implementation. That absence does not establish that external consumers are absent or authorize removing its public constructor. Retain ownership, immutability, and expression-budget validation.

No client-interface widening, testing-only export, or package dependency on the playground is needed for these decisions.

## Related work and evidence

Replay [#29](https://github.com/diegoag64/jev-devtools/pull/29) and comparison [#32](https://github.com/diegoag64/jev-devtools/pull/32) are merged. At revalidation, draft [#31](https://github.com/diegoag64/jev-devtools/pull/31) changes the viewer, [#139](https://github.com/diegoag64/jev-devtools/pull/139) changes flow-delivery scheduling, and [#141](https://github.com/diegoag64/jev-devtools/pull/141) adds capture fidelity. Their PR descriptions were checked for overlap. The lane-label implementation must check the viewer's current state again; this record does not claim those branches were integration-tested.

On the baseline, the existing diagnostic, loop, and observer suites passed all 48 tests. They cover contextual terminals, loop identity, supported nested lanes, rejection identity, and cancellation. The separate public execution/SSR probe establishes the lane-label ambiguity and frozen/primitive rejection behavior above. Local evidence is under ignored `benchmarks/results/issue52-decisions/`; the PR records full verification for the final documentation commit. No new regression test is needed for this decision-only change. The accepted UI implementation owns its regression proof.
