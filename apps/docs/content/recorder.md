Use [`JevRecorder`](@/api/reference/#jevrecorder) to build a custom capture or viewer integration on Node. It records SDK calls and exposes history, but does not create HTTP routes. The [server adapter](@/api/server/) combines those pieces for ordinary application setup.

## JevRecorder

Import `JevRecorder` from `jev-devtools/server`. The example below connects both capture layers: `transport()` observes HTTP attempts, and `instrument()` observes logical `systemOne` calls.

Creating the recorder and client sends no request. Calling `await recordMessage("I was charged twice.")` from Node makes a live request using your server-side key.

<!-- example: recorder.ts -->

`recordMessage()` awaits the SDK result, prints its chosen team, and reads the captured trace from the recorder. The subscriber also reads a detached snapshot whenever the `local` session changes. The recorder retains at most 50 request traces across sessions. Call `unsubscribe()` when that subscriber is no longer needed.

Pair [`instrument()`](@/api/reference/#recorder-instrument) and [`transport()`](@/api/reference/#recorder-transport) so attempts can be associated with logical calls. The instrumented client preserves the original SDK promise, response helpers, and application result.

## Recorder methods

| Method                                                                    | Return type                                               | Purpose                                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`new JevRecorder(options?)`](@/api/reference/#jevrecorder)               | `JevRecorder`                                             | Create bounded history with `limit` and [`redact`](@/api/reference/#createjevdevtools).                                 |
| [`transport(fetcher)`](@/api/reference/#recorder-transport)               | `Fetch`                                                   | Wrap a compatible fetch implementation to capture attempts.                                                             |
| [`instrument(client, metadata)`](@/api/reference/#recorder-instrument)    | `T (the original client type)`                            | Return an instrumented client. Metadata is `{ session, label, source }` or a factory returning that object.             |
| [`snapshot(session)`](@/api/reference/#recorder-snapshot)                 | `Trace[]`                                                 | Return detached traces, newest first, for one session.                                                                  |
| [`changes(session, after?)`](@/api/reference/#recorder-changes)           | `{ revision: number; order: string[]; upserts: Trace[] }` | Return `{ revision, order, upserts }` for incremental viewers. Omit the cursor for a full initial view.                 |
| [`subscribe(listener)`](@/api/reference/#recorder-subscribe)              | `() => void`                                              | Receive affected session sets; returns an unsubscribe function.                                                         |
| [`clear(session)`](@/api/reference/#recorder-clear)                       | `void`                                                    | Remove retained traces for that session.                                                                                |
| [`withFlow(link, onTrace, callback)`](@/api/reference/#recorder-withflow) | `T (the callback result)`                                 | Link a request to `{ runId, stepId, executionId }` while calling through. Normally used by the adapter's flow observer. |

The retention limit applies across all sessions, not separately to each one. Snapshots are detached inspection copies and remain subject to capture limits and redaction.

For an incremental viewer, call `changes(session)` once for the initial data, then pass the returned revision on later reads. Apply `upserts`, remove locally cached IDs missing from `order`, and save the new revision. An empty `upserts` array does not mean nothing changed: traces may have been cleared or evicted.

## Transformed captures

A custom redactor can change a field's type or replace a whole request or response. When the resulting JSON no longer supports the structured view, `Trace.capture.request` or `Trace.capture.result` retains it, including `null`. The corresponding request view is empty or the result is omitted. `captureWarnings` explains the omission, and the drawer shows an unavailable placeholder with the captured content in Raw.

One incompatible field makes that entire request or response view unavailable. Application execution still receives its original values. Fixture export lists unavailable responses in `missing` and retains their warnings. Existing `Trace.request`, `Trace.result`, `QuestionView`, and `AnswerView` declarations are unchanged; `Trace.capture` is optional. Check field presence rather than interpreting strings such as `[redacted]` as metadata.

## Custom flow observers

Import the [`FlowObserver`](@/api/reference/#type-flowobserver) type from `jev-devtools/flow` and pass your implementation as `devtools` to a run. The server adapter already implements it.

[`startFlow(definition, run)`](@/api/reference/#observer-startflow) receives the definition and initial captured run. Return hooks for that execution, or `undefined` to skip observation:

| Hook                               | Receives                                               | Returns                                |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `update(run)`                      | Latest `FlowRun` snapshot                              | `void`                                 |
| `request(link, onTrace, callback)` | Execution IDs, trace-ID callback, and request callback | The request callback's original result |

The request hook must call through synchronously so capture keeps its step linkage. Keep application actions in flow tasks. The runner owns execution results.

Since **0.5.0**, observer snapshots are detached from execution state and observer failures are contained. See the [observer contracts](@/api/reference/#observer-hooks) for parameter types and examples.

## Public type map

| Import                | Types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jev-devtools`        | [`JevDevtoolsProps`](@/api/reference/#type-jevdevtoolsprops), [`Trace`](@/api/reference/#type-trace), [`Snapshot`](@/api/reference/#type-snapshot), [`StreamSnapshot`](@/api/reference/#type-streamsnapshot), [`TraceDelta`](@/api/reference/#type-tracedelta), [`Json`](@/api/reference/#type-json), [`AnswerView`](@/api/reference/#type-answerview), [`QuestionView`](@/api/reference/#type-questionview)                                                                                                                                                                                                                                                                                          |
| `jev-devtools/server` | [`JevDevtoolsServerOptions`](@/api/reference/#type-jevdevtoolsserveroptions), [`CaptureOptions`](@/api/reference/#type-captureoptions), [`ClientMetadata`](@/api/reference/#type-clientmetadata)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `jev-devtools/flow`   | [`FlowBuilder`](@/api/reference/#type-flowbuilder), [`FlowExpression`](@/api/reference/#flowexpression), [`FlowOutcome`](@/api/reference/#type-flowoutcome), [`FlowRunOptions`](@/api/reference/#type-flowrunoptions), [`FlowTask`](@/api/reference/#type-flowtask), [`FlowRequestFactory`](@/api/reference/#type-flowrequestfactory), [`TaskContext`](@/api/reference/#type-taskcontext), [`Resolved`](@/api/reference/#type-resolved), [`FlowObserver`](@/api/reference/#type-flowobserver), [`FlowDisplay`](@/api/reference/#type-flowdisplay), [`FlowDefinition`](@/api/reference/#type-flowdefinition), [`FlowRun`](@/api/reference/#type-flowrun), [`FlowStep`](@/api/reference/#type-flowstep) |

Use `import type` for data-only contracts. `/server` and `/flow` runtime imports belong on Node. Root protocol types are browser-safe.

## Flow capture warnings

| Field                               | Type                  | Describes                             |
| ----------------------------------- | --------------------- | ------------------------------------- |
| `FlowRun.captureWarnings`           | `string[]` (optional) | Captured outcome `value`.             |
| `FlowNode.conditionCaptureWarnings` | `string[]` (optional) | Captured `conditionRule`.             |
| `FlowStep.captureWarnings`          | `string[]` (optional) | Captured task, merge, or loop `data`. |

Warnings travel with the flow stream, including nested item runs, and appear beside affected values in the drawer. They describe the inspection copy. Runtime values and decisions remain unchanged.

For example, a 20,000-character outcome or rule literal is captured as at most 16,000 characters with a warning. Arrays and general objects retain at most 150 entries. Capture also has a depth limit of 12 and an approximate 96,000-character budget.

Older captures without warning metadata have unknown completeness. Do not infer redaction or truncation from arbitrary user strings. Redactors should return replacement values because in-place mutations cannot reliably produce warning metadata.

Replay fixtures contain Jev response bodies and their trace warnings, not outcome or rule data. See the [capture metadata contract](https://github.com/diegoag64/jev-devtools/blob/main/docs/stream-protocol.md#flow-capture-warnings).

Structured condition rules also have a 128-node projection budget. Exceeding it retains `conditionCaptureWarnings` before server capture; it does not change execution. Unsupported rule literals likewise carry an explicit warning.

## Version-matched declarations

The installed package's `lib/src/index.d.ts`, `lib/server/index.d.ts`, and `lib/flow/index.d.ts` are the precise contracts for that version. The [API glossary](@/api/reference/#public-types) includes exact public declarations and their supporting shapes. Additional stream semantics are documented in the [stream protocol](https://github.com/diegoag64/jev-devtools/blob/main/docs/stream-protocol.md) and installed declarations.

<a id="replay-types-unreleased"></a>

## Replay types

Available since **0.5.0**.

[`FlowFixture`](@/api/reference/#type-flowfixture) and [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture) are also exported from the root and `/flow` entries. The browser-safe [`flowFixture()`](@/api/reference/#flowfixture) helper builds an export from captured data; Node-only [`replayClient()`](@/api/reference/#replayclient) uses it to supply stored answers to a flow. See [replay reference](@/api/flow/#replay-captured-answers).
