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
