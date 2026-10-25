Most applications should use the [server adapter](@/api/server/). Reach for `JevRecorder` when implementing your own transport or viewer integration.

## JevRecorder

<!-- example: recorder.ts -->

`instrument` observes logical calls; `transport` observes HTTP attempts. Pair them to preserve both views. The instrumented proxy preserves the original SDK promise and response helpers. This example needs a real key when you call `client.systemOne()`.

## Recorder methods

| Method                              | Purpose                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `new JevRecorder(options?)`         | Create bounded history with `limit` and `redact`.                                                                       |
| `transport(fetcher)`                | Wrap a compatible fetch implementation to capture attempts.                                                             |
| `instrument(client, metadata)`      | Return an instrumented client. Metadata is `{ session, label, source }` or a factory returning that object.             |
| `snapshot(session)`                 | Return detached traces, newest first, for one session.                                                                  |
| `changes(session, after?)`          | Return `{ revision, order, upserts }` for incremental viewers. Omit the cursor for a full initial view.                 |
| `subscribe(listener)`               | Receive affected session sets; returns an unsubscribe function.                                                         |
| `clear(session)`                    | Remove retained traces for that session.                                                                                |
| `withFlow(link, onTrace, callback)` | Link a request to `{ runId, stepId, executionId }` while calling through. Normally used by the adapter's flow observer. |

The retention limit is global to the recorder, not a per-session allocation. Snapshots are captured inspection copies, not complete original SDK objects.

## Custom flow observers

`FlowObserver` is exported from `jev-devtools/flow`. Its `startFlow(definition, run)` can return `{ update(run), request(link, onTrace, callback) }` or `undefined`. Recording is optional; the flow runner owns execution results.

The request hook should call through synchronously to preserve request linkage. Avoid using observer callbacks for application actions. In the working tree, observer snapshots are detached from execution state and failures are contained; see the changelog for these **unreleased** robustness changes.

## Public type map

| Import                | Types                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jev-devtools`        | `JevDevtoolsProps`, `Trace`, `Snapshot`, `StreamSnapshot`, `TraceDelta`, `Json`, `AnswerView`, `QuestionView`                                                                                         |
| `jev-devtools/server` | `JevDevtoolsServerOptions`, `CaptureOptions`, `ClientMetadata`                                                                                                                                        |
| `jev-devtools/flow`   | `FlowBuilder`, `FlowExpression`, `FlowOutcome`, `FlowRunOptions`, `FlowTask`, `FlowRequestFactory`, `TaskContext`, `Resolved`, `FlowObserver`, `FlowDisplay`, `FlowDefinition`, `FlowRun`, `FlowStep` |

Use `import type` for data-only contracts. `/server` and `/flow` runtime imports belong on Node. Root protocol types are browser-safe.

## Version-matched declarations

The installed package's `lib/src/index.d.ts`, `lib/server/index.d.ts`, and `lib/flow/index.d.ts` are the precise contracts for that version. This starter reference introduces all public entry points and runtime operations; detailed field-by-field protocol documentation remains in the [stream protocol](https://github.com/diegoag64/jev-devtools/blob/main/docs/stream-protocol.md) and installed declarations.

## Replay types (unreleased)

`FlowFixture` and `BuiltFlowFixture` are also exported from the root and `/flow` entries. The browser-safe `flowFixture()` helper builds an export from captured data; Node-only `replayClient()` uses it to supply stored answers to a flow. See [replay reference](@/api/flow/#replay-captured-answers-unreleased).
