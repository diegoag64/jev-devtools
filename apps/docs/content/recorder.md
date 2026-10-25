Most applications should use the [server adapter](@/api/server/). Reach for [`JevRecorder`](@/api/reference/#jevrecorder) when implementing your own transport or viewer integration.

## JevRecorder

<!-- example: recorder.ts -->

[`instrument`](@/api/reference/#recorder-instrument) observes logical calls; [`transport`](@/api/reference/#recorder-transport) observes HTTP attempts. Pair them to preserve both views. The instrumented proxy preserves the original SDK promise and response helpers. This example needs a real key when you call `client.systemOne()`.

## Recorder methods

| Method                              | Purpose                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`new JevRecorder(options?)`](@/api/reference/#jevrecorder)         | Create bounded history with `limit` and [`redact`](@/api/reference/#createjevdevtools).                                                                       |
| [`transport(fetcher)`](@/api/reference/#recorder-transport)                | Wrap a compatible fetch implementation to capture attempts.                                                             |
| [`instrument(client, metadata)`](@/api/reference/#recorder-instrument)      | Return an instrumented client. Metadata is `{ session, label, source }` or a factory returning that object.             |
| [`snapshot(session)`](@/api/reference/#recorder-snapshot)                 | Return detached traces, newest first, for one session.                                                                  |
| [`changes(session, after?)`](@/api/reference/#recorder-changes)          | Return `{ revision, order, upserts }` for incremental viewers. Omit the cursor for a full initial view.                 |
| [`subscribe(listener)`](@/api/reference/#recorder-subscribe)               | Receive affected session sets; returns an unsubscribe function.                                                         |
| [`clear(session)`](@/api/reference/#recorder-clear)                    | Remove retained traces for that session.                                                                                |
| [`withFlow(link, onTrace, callback)`](@/api/reference/#recorder-withflow) | Link a request to `{ runId, stepId, executionId }` while calling through. Normally used by the adapter's flow observer. |

The retention limit is global to the recorder, not a per-session allocation. Snapshots are captured inspection copies, not complete original SDK objects.

## Custom flow observers

[`FlowObserver`](@/api/reference/#type-flowobserver) is exported from `jev-devtools/flow`. Its [`startFlow(definition, run)`](@/api/reference/#observer-startflow) can return `{ update(run), request(link, onTrace, callback) }` or `undefined`. Recording is optional; the flow runner owns execution results.

The request hook should call through synchronously to preserve request linkage. Avoid using observer callbacks for application actions. In the working tree, observer snapshots are detached from execution state and failures are contained; see the changelog for these **unreleased** robustness changes.

## Public type map

| Import                | Types                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jev-devtools`        | [`JevDevtoolsProps`](@/api/reference/#type-jevdevtoolsprops), [`Trace`](@/api/reference/#type-trace), [`Snapshot`](@/api/reference/#type-snapshot), [`StreamSnapshot`](@/api/reference/#type-streamsnapshot), [`TraceDelta`](@/api/reference/#type-tracedelta), [`Json`](@/api/reference/#type-json), [`AnswerView`](@/api/reference/#type-answerview), [`QuestionView`](@/api/reference/#type-questionview)                                                                                         |
| `jev-devtools/server` | [`JevDevtoolsServerOptions`](@/api/reference/#type-jevdevtoolsserveroptions), [`CaptureOptions`](@/api/reference/#type-captureoptions), [`ClientMetadata`](@/api/reference/#type-clientmetadata)                                                                                                                                        |
| `jev-devtools/flow`   | [`FlowBuilder`](@/api/reference/#type-flowbuilder), [`FlowExpression`](@/api/reference/#flowexpression), [`FlowOutcome`](@/api/reference/#type-flowoutcome), [`FlowRunOptions`](@/api/reference/#type-flowrunoptions), [`FlowTask`](@/api/reference/#type-flowtask), [`FlowRequestFactory`](@/api/reference/#type-flowrequestfactory), [`TaskContext`](@/api/reference/#type-taskcontext), [`Resolved`](@/api/reference/#type-resolved), [`FlowObserver`](@/api/reference/#type-flowobserver), [`FlowDisplay`](@/api/reference/#type-flowdisplay), [`FlowDefinition`](@/api/reference/#type-flowdefinition), [`FlowRun`](@/api/reference/#type-flowrun), [`FlowStep`](@/api/reference/#type-flowstep) |

Use `import type` for data-only contracts. `/server` and `/flow` runtime imports belong on Node. Root protocol types are browser-safe.

## Version-matched declarations

The installed package's `lib/src/index.d.ts`, `lib/server/index.d.ts`, and `lib/flow/index.d.ts` are the precise contracts for that version. The [API glossary](@/api/reference/#public-types) includes exact public declarations and their supporting shapes. Additional stream semantics are documented in the [stream protocol](https://github.com/diegoag64/jev-devtools/blob/main/docs/stream-protocol.md) and installed declarations.

## Replay types (unreleased)

[`FlowFixture`](@/api/reference/#type-flowfixture) and [`BuiltFlowFixture`](@/api/reference/#type-builtflowfixture) are also exported from the root and `/flow` entries. The browser-safe [`flowFixture()`](@/api/reference/#flowfixture) helper builds an export from captured data; Node-only [`replayClient()`](@/api/reference/#replayclient) uses it to supply stored answers to a flow. See [replay reference](@/api/flow/#replay-captured-answers-unreleased).
