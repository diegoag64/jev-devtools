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

## Delivery and recovery

Capture remains immediate; delivery still batches at the next event-loop turn. Only changed trace payloads are cloned, serialized and encoded. The retained ID list is at most 200 entries. Same-session viewers at the same cursor share serialization during that flush, with independent response buffers. Viewers at different cursors receive separately computed updates.

An unread stream keeps a bounded queue and a dirty flag. When it can consume again, the server computes changes since that stream's own cursor against current retained state. It does not accumulate a mutation queue. Unchanged trace objects preserve identity in the browser; the ordered array is rebuilt from at most 200 IDs.

The client validates envelope versions, revision continuity, unique IDs and whether all retained IDs can be resolved before committing an update. A gap, duplicate/out-of-order delta, malformed envelope or unknown retained ID closes the stream and schedules a fresh connection after one second. Old events cannot overwrite the new connection, and unmount cancels pending retries. Ordinary EventSource reconnects also receive a full snapshot; a server restart can therefore reset its revision counter safely.

The browser applies and validates every event in arrival order, then publishes the latest accumulated history to React once per animation frame. It does not skip protocol revisions or discard independent traces. Fast pending-to-complete transitions can share one paint; requests still pending at publication remain visible as pending. A 100 ms timeout is a fallback when animation frames are suspended (background browser timer throttling can delay it). Only one latest array is queued, and publication cancels the other scheduled callback. Invalid data discards queued publication before resynchronizing; unmount cancels both publication callbacks and reconnect retries. Connection status updates remain immediate.

Authorization, same-origin enforcement, server-derived session scope and capture limits remain in force. Known credential fields and custom server-redacted data are removed before delivery; HTTP headers/options are not captured. Additional personal-data display masking is controlled locally by the `redactAdditionalSensitiveData` component prop, so those fields remain present in SSE payloads even while masked in DevTools. Prop changes neither mutate stored stream records nor reconnect the streams. No settings fields, events or write endpoint are added to this protocol. See the [redaction policy](integration.md#redaction-policy).

## Remaining costs

The initial full snapshot can still be large. Each changed trace still sends its complete captured state/result, and every delta carries the retained ID order. While the drawer is closed, transport and parsing continue but trace-driven React updates are suspended. Large diagrams still have layout costs. See the [transport comparison in PR #15](https://github.com/diegoag64/jev-devtools/pull/15) and [hidden-drawer comparison in PR #16](https://github.com/diegoag64/jev-devtools/pull/16) for benefits and limits.

## Flow capture warnings

The separate `/flows/events` stream sends version-1 `flows` envelopes with `definitions`, `upserts`, and authoritative run `order`. Definitions are sent when first needed by a connection; run upserts replace complete records. Both retain optional capture warnings, including nested item definitions and runs:

| Field | Type | Applies to |
| --- | --- | --- |
| `FlowNode.conditionCaptureWarnings` | `string[]` (optional) | This node's `conditionRule`, including loop continuation rules. |
| `FlowRun.captureWarnings` | `string[]` (optional) | This run's `value`, including map item and loop iteration outcomes. |
| `FlowStep.captureWarnings` | `string[]` (optional) | This step's `data`, including task, merge, and loop state. |
| `Trace.captureWarnings` | `string[]` | Captured request/response data linked to Jev steps. |

For example, an outcome string of 20,000 characters is captured as 16,000 characters with `captureWarnings: ["Long text truncated in capture."]`; execution still returns all 20,000 characters. A shortened comparison literal carries the same warning in its node's `conditionCaptureWarnings`, while its decision records the full runtime comparison.

Capture limits remain 16,000 characters per string, 150 array entries/general object properties (256 for `criteria`/`probabilities` maps), depth 12, and an approximate 96,000-character traversal budget per capture. Aggregate budgets can shorten individual values below their per-value limits. Observer snapshots can also be unavailable for unsupported non-JSON values; merge and outcome metadata retain that failure explicitly.

Structured condition rules also have a 128-node projection budget. Exceeding it retains `conditionCaptureWarnings` before server capture; it does not change execution. Unsupported rule literals likewise carry an explicit warning.

Warning text is descriptive, not a stable machine-readable enum. A nonempty array means a capture limitation was observed for that field; absence on old captures means unknown, not complete. An empty array means no warning was recorded, not a guarantee of lossless replay. Credential removal and custom redactors returning a changed value produce a redaction warning. Return a replacement from custom redactors rather than mutating objects in place: in-place changes cannot reliably be detected. Display-only personal-data masking is separate from these server warnings.

Consumers must consult metadata rather than interpret user strings such as `[truncated]`, `[redacted]`, or `[capture unavailable]` as control signals. This change does not version or redesign the protocol. Existing captures remain readable; updating both server and drawer enables warning display beside rules and outcome values. The drawer also shows warnings for step data. `flowFixture()` only exports linked Jev response bodies and their trace warnings; it does not export outcome or rule data, so those warnings do not change the fixture format. Replays execute the authored rules again. A future evaluator of recorded rules (such as PR #31) must account for the corresponding rule and value warnings before trusting them.
