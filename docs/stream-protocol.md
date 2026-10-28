# Inspector stream protocol

The React component opts into incremental updates automatically. Installation, server options, and the `<JevDevtools>` API are unchanged. Trace payloads still use version 1; the SSE envelope has its own version.

| Connection                            | Initial event         | Subsequent events        |
| ------------------------------------- | --------------------- | ------------------------ |
| `/events` (legacy clients)            | `snapshot`, version 1 | Full version 1 snapshots |
| `/events?protocol=2` (current client) | `snapshot`, version 2 | Version 2 `delta` events |

The endpoint config remains `{ "version": 1, "enabled": true }`. A current client also accepts version 1 snapshots from older servers, which ignore the query parameter. Existing clients do not request version 2 and continue receiving full snapshots from the new server. Update both the server and browser package to obtain the incremental transport benefit. Restart the server after upgrading so any shared adapter retained across hot reloads is recreated with the new implementation.

## Envelopes

The initial version 2 `snapshot` contains `revision` and a complete, newest-first `traces` array. It replaces the client's entire state, including its revision cursor. Every connection/reconnection starts this way; no replay log or `Last-Event-ID` recovery is required.

A version 2 `delta` contains:

- `base`: the revision last delivered on this stream.
- `revision`: the new revision. It must be greater than `base`, but need not be consecutive: batching combines mutations, and other sessions can advance the recorder's counter.
- `upserts`: complete, redacted trace payloads that changed after `base`. These replace or add traces by ID. This is trace-level replacement, not a JSON patch of individual fields.
- `order`: the authoritative newest-first retained IDs for the authorized session. IDs omitted from this list are removed, handling eviction and clear without retained tombstones. IDs in the list must resolve from existing state or the upserts.

An empty `order` and empty `upserts` clear the viewer. An ID that was evicted and later finishes its SDK call is not resurrected. The recorder's history limit is still global across sessions, so a request in one session can evict a trace from another. The evicted session receives only its own new retained order, never the other session's trace.

## Transformed request and response captures

`Trace.capture?: { request?: Json; result?: Json }` retains bounded redacted content that cannot supply the corresponding structured view. Any JSON value is valid in those fields, including `null`. An unavailable request has the empty display view `{ model: "", state: null, questions: {} }`; an unavailable response omits `Trace.result`. `captureWarnings` explains the unavailable section. The trace ID, status, attempts and flow link still describe the actual SDK call.

The drawer builds a partial display from this captured JSON and from legacy redacted request/result JSON. Usable fields remain visible beside unavailable-field placeholders. This display does not change the wire declarations or make an incomplete response suitable for fixture export. It preserves valid structured captures and their object identity. Parsers must distinguish the structural trace envelope from arbitrary captured JSON, including the optional `capture` fields. User strings such as `[redacted]` do not control availability. Raw retains the captured content, and fixture export reports an unavailable response as missing rather than inventing answers.

## Delivery and recovery

Capture remains immediate; delivery still batches at the next event-loop turn. Only changed trace payloads are cloned, serialized and encoded. The retained ID list is at most 200 entries. Same-session viewers at the same cursor share serialization during that flush, with independent response buffers. Viewers at different cursors receive separately computed updates.

An unread stream keeps a bounded queue and a dirty flag. When it can consume again, the server computes changes since that stream's own cursor against current retained state. It does not accumulate a mutation queue. Unchanged trace objects preserve identity in the browser; the ordered array is rebuilt from at most 200 IDs.

The client validates envelope versions, revision continuity, record structure, unique IDs, and retained-ID relationships before committing an update. A gap, duplicate/out-of-order delta, malformed envelope or unknown retained ID closes the stream and schedules a fresh connection after one second. Old events cannot overwrite the new connection, and unmount cancels pending retries. Ordinary EventSource reconnects also receive a full snapshot; a server restart can therefore reset its revision counter safely.

The browser applies and validates every event in arrival order, then publishes the latest accumulated history to React once per animation frame. It does not skip protocol revisions or discard independent traces. Fast pending-to-complete transitions can share one paint; requests still pending at publication remain visible as pending. A 100 ms timeout is a fallback when animation frames are throttled. Only one latest array is queued, and publication cancels the other scheduled callback. Invalid data discards queued publication before resynchronizing; unmount cancels both publication callbacks and reconnect retries. Connection status updates remain immediate.

The drawer and embedded viewer close both streams when their browser page becomes hidden, starts navigation (`beforeunload`), or receives `pagehide`. This releases HTTP/1 connections before a refresh can queue behind existing streams, including in embedded browsers that report every tab as visible. Pausing cancels pending publications and retries. A visible or restored page reconnects with fresh trace and flow snapshots. If navigation is cancelled, the surviving document resumes after one second. Server capture continues independently; the resumed page receives the history still retained within the recorder's limits. Closing the drawer within a visible page still keeps its subscriptions active. Browsers can limit back/forward caching for pages with a `beforeunload` listener.

Authorization, same-origin enforcement, server-derived session scope and capture limits remain in force. Known credential fields and custom server-redacted data are removed before delivery; HTTP headers/options are not captured. Additional personal-data display masking is controlled locally by the `redactAdditionalSensitiveData` component prop, so those fields remain present in SSE payloads even while masked in DevTools. Prop changes neither mutate stored stream records nor reconnect the streams. No settings fields, events or write endpoint are added to this protocol. See the [redaction policy](integration.md#redaction-policy).

## Record validation and compatibility

Network JSON enters the trace and flow parsers as `unknown`. The browser commits an event only after every record and retained-ID relationship passes validation. A malformed record cancels pending publication and requests a fresh connection through the existing recovery path. Previously published history remains intact until a valid replacement arrives. Events from the failed connection are ignored, including during the retry delay.

The supported wire contract separates recorder-owned metadata from captured content:

- Trace metadata includes version 1, nonempty IDs, string session/label fields, known source/status values, finite timestamps, nonnegative durations, attempts, error details, warning arrays, and optional flow links. Snapshots and upserts contain at most 200 distinct traces. Every delta upsert belongs to its retained order.
- Flow definitions contain version 1, nonempty IDs, names, and typed nodes. Dependencies form an acyclic graph within the same definition; merge references resolve within that definition. Node IDs are unique. Nested templates share the producer's 256-node definition budget. That budget does not limit parallel lane counts or repeated dependency entries: empty lanes can reuse a predecessor without adding nodes. Supported template nesting reaches a loop's map item program.
- Flow runs refer to known definitions and contain one typed step per definition node. Step keys match their IDs. Nested runs refer to their collection's item definition; run and execution IDs are unique within each expanded run. Collections contain ordered, contiguous item indices with matching totals, at most 64 items, and concurrency from 1 to 16. Loop collections use concurrency 1. Nested runs share the producer's 1,024-step expansion budget.
- Request/result content, task data, outcomes, and condition rules are captured JSON. Redaction can replace entire content sections or individual values. Content validation checks finite JSON and capture-compatible collection/depth bounds, then projects request/result content into safe structured views. Incompatible legacy request/result JSON remains available through explicit capture metadata and warnings. It is not rejected for failing an SDK answer shape.

Captured JSON accepts arrays up to 150 entries and objects up to 256 properties, including full choice maps. Objects and arrays can occur through depth 12, with scalar truncation markers at depth 13. Image previews can exceed the ordinary 16,000-character string limit, so the parser does not apply that limit to every string. These structural bounds are not a whole-message byte budget. The parser does not infer capture completeness from marker-like strings.

Version-1 optional metadata remains optional, including node display text, lanes, rules, and flow capture warnings. Compatible unknown fields are retained as bounded JSON, including fields shown in Raw. Validation does not require a trace linked from a flow to remain in request history, because request eviction is independent. Each event stages definitions and runs together; a rejected event cannot install a definition or partially replace a run. The stream envelope versions and producer capture limits are unchanged.

## Remaining costs

The initial full snapshot can still be large. Each changed trace still sends its complete captured state/result, and every delta carries the retained ID order. While the drawer is closed, transport and parsing continue but trace-driven React updates are suspended. Large diagrams still have layout costs. See the [transport comparison in PR #15](https://github.com/diegoag64/jev-devtools/pull/15) and [hidden-drawer comparison in PR #16](https://github.com/diegoag64/jev-devtools/pull/16) for benefits and limits.

## Flow delivery

The separate `/flows/events` endpoint uses version-1 `flows` envelopes with `definitions`, complete run `upserts`, and authoritative retained run `order`. Each connection/reconnection starts with a full snapshot. Later updates include definitions that this reader does not yet know; its knowledge is pruned only after delivering the new order. A clear skipped under backpressure therefore cannot erase definitions that the reader still retains.

Ready readers with the same authorized session, cursor, and definition knowledge share one recorder projection, clone, serialization, and encoding during a synchronous delivery turn. Each Response owns an independent byte buffer. The cache is discarded after that turn; initial snapshots and readers with different state are computed separately. Cancellation releases the reader without changing another reader's definition knowledge.

After the immediate initial snapshot, ready flow readers use a fixed 16 ms coalescing window. The first pending reader schedules the window for the adapter; later activity joins it without resetting the deadline. This reduces repeated full-run cloning, encoding, transfer, and parsing during bursts. A running flow still publishes during sustained activity. Success, error, cancellation, clear, and eviction use the same window, even when no later update occurs. Node event-loop load can delay the timer beyond 16 ms; this is a scheduling policy, not a delivery-latency guarantee. Reconnecting starts an immediate full snapshot without waiting for a pending window.

A stalled reader retains its queued message and a dirty flag, then joins a delivery window from its own cursor when it reads again. It does not accumulate a queue of missed revisions or delay other readers. Intermediate updates may be coalesced, including clear/reuse transitions, but the delivered order and upserts must reconstruct the complete retained state under the existing capture policy. Evicted or cleared runs cannot be resurrected by later observer updates. Closing a stream removes its pending delivery; closing the last pending stream cancels the timer.

Sharing reduces repeated server work for matching viewers; coalescing reduces update frequency at the cost of an intentional delay of up to one window. Neither reduces the size of a run upsert. Each upsert still contains the entire retained nested run, and each viewer still receives its own bytes. Initial and reconnect snapshots remain proportional to the retained history. Capture traversal and observer snapshots also run when there are no viewers. The per-value limits below do **not** impose a whole-run byte or heap budget.

[Issue #46](https://github.com/diegoag64/jev-devtools/issues/46) remains open for aggregate-budget and finer-grained delta design work. A whole-run budget needs explicit metadata identifying omitted items/steps/values and a decision about final-state completeness; it must not silently remove content or change application execution. Item/step deltas need a negotiated envelope with base/revision validation, replacement/removal rules, definition ordering, and reconnect recovery, plus compatible viewer/fixture consumers. Deltas alone would not bound the initial or final full snapshot. Sharing and coalescing preserve the version-1 envelope, old-capture readability, capture warnings, redaction, and full application results. They introduce no omissions or whole-run budget. A configurable window or terminal-update bypass would add policy and testing complexity; the fixed window keeps one deadline for all changes and makes no claim to support arbitrary history sizes.

## Flow capture warnings

The separate `/flows/events` stream sends version-1 `flows` envelopes with `definitions`, `upserts`, and authoritative run `order`. Definitions are sent when first needed by a connection; run upserts replace complete records. Both retain optional capture warnings, including nested item definitions and runs:

| Field                               | Type                  | Applies to                                                          |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------- |
| `FlowNode.conditionCaptureWarnings` | `string[]` (optional) | This node's `conditionRule`, including loop continuation rules.     |
| `FlowRun.captureWarnings`           | `string[]` (optional) | This run's `value`, including map item and loop iteration outcomes. |
| `FlowStep.captureWarnings`          | `string[]` (optional) | This step's `data`, including task, merge, and loop state.          |
| `Trace.captureWarnings`             | `string[]`            | Captured request/response data linked to Jev steps.                 |

For example, an outcome string of 20,000 characters is captured as 16,000 characters with `captureWarnings: ["Long text truncated in capture."]`; execution still returns all 20,000 characters. A shortened comparison literal carries the same warning in its node's `conditionCaptureWarnings`, while its decision records the full runtime comparison.

Capture limits remain 16,000 characters per string, 150 array entries/general object properties (256 for `criteria`/`probabilities` maps), depth 12, and an approximate 96,000-character traversal budget per capture. Aggregate budgets can shorten individual values below their per-value limits. Observer snapshots can also be unavailable for unsupported non-JSON values; merge and outcome metadata retain that failure explicitly.

Structured condition rules also have a 128-node projection budget. Exceeding it retains `conditionCaptureWarnings` before server capture; it does not change execution. Unsupported rule literals likewise carry an explicit warning.

Warning text is descriptive, not a stable machine-readable enum. A nonempty array means a capture limitation was observed for that field; absence on old captures means unknown, not complete. An empty array means no warning was recorded, not a guarantee of lossless replay. Credential removal and custom redactors returning a changed value produce a redaction warning. Return a replacement from custom redactors rather than mutating objects in place: in-place changes cannot reliably be detected. Display-only personal-data masking is separate from these server warnings.

Consumers must consult metadata rather than interpret user strings such as `[truncated]`, `[redacted]`, or `[capture unavailable]` as control signals. This change does not version or redesign the protocol. Existing captures remain readable; updating both server and drawer enables warning display beside rules and outcome values. The drawer also shows warnings for step data. `flowFixture()` only exports linked Jev response bodies and their trace warnings; it does not export outcome or rule data, so those warnings do not change the fixture format. Replays execute the authored rules again. An evaluator of recorded rules must follow the [capture fidelity consumer rules](#capture-fidelity-and-analysis-consumers) before trusting corresponding rules and values.

## Capture fidelity and analysis consumers

`CaptureFidelity`, exported from `jev-devtools`, is optional version-1 metadata. It describes one captured JSON section, not an entire run, a recorded decision, or object identity.

| Field                               | Captured section |
| ----------------------------------- | ---------------- |
| `Trace.captureFidelity.request`     | Request content  |
| `Trace.captureFidelity.result`      | Response content |
| `FlowNode.conditionCaptureFidelity` | `conditionRule`  |
| `FlowStep.captureFidelity`          | `data`           |
| `FlowRun.captureFidelity`           | `value`          |

Each field has three possible values:

- `exact`: the producer preserved the section's JSON values through every capture stage. This does not certify SDK validity, reference availability, or replay equivalence.
- `modified`: a stage observed a rewrite, truncation, unsupported-value conversion, repeated-reference substitution, unavailable snapshot, or display projection. This status covers the whole section; it does not identify which descendant changed.
- `unknown`: exactness is not established. Every custom-redactor invocation makes its section at least unknown, including identity callbacks and in-place mutations. Accessor-based snapshots, proxies, and values with a `toJSON` property are also unknown unless another stage establishes modification. The producer checks serialization-hook presence without reading or invoking the hook, including nonenumerable and inherited properties. Flow observer and merge snapshots retain this uncertainty before copying discards the hook. Missing fidelity metadata has this same interpretation.

A later stage never upgrades `unknown` or `modified` to `exact`. The Flow runner supplies provenance before observer delivery; storage cannot certify an old or custom observer's unannotated snapshot. Nested definitions and item runs carry their own section metadata. Request and response fidelity are independent: a redacted request does not invalidate an unchanged response. Display masking and incompatible structured-view projections downgrade affected sections without changing stored captures or application values. Bounded callback detachment marks omissions as `modified`, including when a root-replacement policy returns a complete scalar. Omission guards and frozen context apply to the shared traversal used by both recorders. Unsupported values can have `modified` fidelity even when older warning behavior emits no warning.

### Consumer rules

Inspection can display any available captured JSON and the actual recorded status or decision, with existing warnings and unavailable-field views. Marker-like user strings remain ordinary data, even with `exact` fidelity.

Analysis that claims an original value or a counterfactual requires all of the following:

1. The rule exists, has `conditionCaptureFidelity === "exact"`, and passes the consumer's operator, arity, and literal validation.
2. Every referenced source exists in the correct run or nested item. Its section has `captureFidelity === "exact"`, or `captureFidelity.result === "exact"` for a Jev response. Missing or evicted traces, uncaptured flow inputs, and uncaptured aggregate references make that decision unavailable.
3. Every path resolves through the source's own captured properties. The resulting operands satisfy the runtime operator's type and finite-number requirements. Neither an exact rule nor an exact parent section makes a missing path available.
4. The consumer follows the runtime evaluation semantics and reproduces the recorded decision before applying an override. This consistency check is necessary but does not replace the first three checks.

Treat `modified`, `unknown`, and absent metadata as unavailable for that analysis. Do not replace missing values with `null`, parse warning text as an enum, or detect loss by matching marker strings. Warnings remain descriptive; empty arrays cannot establish exactness. Fidelity is producer metadata, not authentication for arbitrary imported records.

For example, a task's actual `0.9` can be captured as `0.6`. Both satisfy `>= 0.5`, so agreement with the recorded decision proves little. Changing the threshold to `0.8` would falsely predict a route flip from the capture. Replacement callbacks produce `modified`; undetected in-place changes remain `unknown`. Neither is eligible for counterfactual analysis.

`flowFixture()` retains its existing contract: it exports structurally usable captured Jev response bodies and trace warnings. It does not require `exact`, and it does not export this metadata into fixture version 1. `replayClient()` and `compareWithFixture()` run authored application logic with fixture answers; they do not promise reconstruction of the original execution. This change does not tighten fixture matching or export eligibility.

### Compatibility and remaining scope

Current parsers accept old version-1 captures without fidelity metadata and retain their display behavior. Old captures remain unknown for exact analysis even if warning arrays are empty. Existing version-1 parsers retain compatible extra JSON fields, but older consumers do not enforce this policy. Keep server and viewer builds matched; no new mixed-version execution or analysis guarantee is introduced. The trace and flow envelope versions are unchanged, and no capture migration is required.

Draft [PR #31](https://github.com/diegoag64/jev-devtools/pull/31) still needs to implement the consumer rules above. Adding producer metadata does not repair that draft evaluator. Finer per-path provenance, proof of unchanged custom-redactor output, capture of currently unavailable aggregate inputs, protocol negotiation, and incompatible record redesign remain separate design work under [#53](https://github.com/diegoag64/jev-devtools/issues/53). Future aggregate omissions must downgrade the affected section and preserve explicit metadata; this change does not add an aggregate omission policy.
