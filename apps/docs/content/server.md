## createJevDevtools(options)

Create one independent adapter for a Node process whose lifecycle you own.

<!-- example: server.ts -->

## Options

| Option                | Default              | Purpose                                                                                   |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `origin`              | Required             | Exact browser origin, including port.                                                     |
| `enabled`             | `false`              | Enable capture and inspector endpoints.                                                   |
| `endpoint`            | `/api/jev-devtools`  | Absolute path, without query or fragment.                                                 |
| `limit`               | `50`                 | Maximum retained request traces, clamped to 1–200.                                        |
| [`redact(path, value)`](@/api/reference/#createjevdevtools) | None                 | Transform captured values before storing or streaming.                                    |
| [`authorize(request)`](@/api/reference/#createjevdevtools)  | None                 | Synchronous or async application access check. Required for enabled non-loopback origins. |
| [`getSession(request)`](@/api/reference/#createjevdevtools) | Shared `local` scope | Synchronous or async server-derived scope; a nonempty string of at most 200 characters.   |

These form [`JevDevtoolsServerOptions`](@/api/reference/#type-jevdevtoolsserveroptions); `limit` and [`redact`](@/api/reference/#createjevdevtools) also form the exported [`CaptureOptions`](@/api/reference/#type-captureoptions) type.

## createClient(options, metadata?)

Accepts the TypeSafe SDK's constructor options and returns an instrumented SDK client. Metadata is `{ label?: string, source?: 'sample' | 'live' }`, exported as [`ClientMetadata`](@/api/reference/#type-clientmetadata). Defaults are `Jev request` and `live`.

```ts api=server
const client = inspector.createClient(
  { apiKey: process.env.TYPESAFE_API_KEY },
  { label: "Support triage", source: "live" },
);
```

Changing `source` only labels captures; it does not turn live inference into a sample transport. With recording disabled, this method returns an ordinary SDK client. Only `systemOne` calls on the instrumented client are captured.

## HTTP adapters

| Method                       | Use when                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`middleware(req, res, next)`](@/api/reference/#adapter-middleware) | Your Node application uses Express/Connect-style middleware. Mount at root; unrelated paths call `next`.                           |
| [`handle(request)`](@/api/reference/#adapter-handle)            | Your framework supplies a Web Request with the actual public URL. Returns a Web Response.                                          |
| [`handleNodeRoute(request)`](@/api/reference/#adapter-handlenoderoute)   | A Node framework such as Next reconstructs internal request URLs. Checks Host, normalizes URL, then applies regular access checks. |

Route the base path **and all subpaths** to the same adapter. The browser uses configuration, SSE events, flow events, and `DELETE /clear`. The package handles that protocol for you; see the [stream protocol](https://github.com/diegoag64/jev-devtools/blob/main/docs/stream-protocol.md) if building another viewer.

## getJevDevtools(key, createOptions)

```ts api=server
import { getJevDevtools } from "jev-devtools/server";

const inspector = getJevDevtools("my-app", () => ({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000",
}));
```

Returns the same adapter for a stable, nonempty key in the same Node realm. The options factory runs once per key. Restart after configuration changes. Different keys have separate histories; different processes do not share histories.

## run(request, callback)

Select the request's server-derived recording scope while the callback runs. Use it for inference handlers when [`getSession`](@/api/reference/#createjevdevtools) is customized:

```ts api=server
return inspector.run(request, () => jev.systemOne(input));
```

Here `request` and `input` come from your application handler. Authenticate that handler separately: [`run`](@/api/reference/#adapter-run) scopes capture but does not authorize the application action.

## dispose() and startFlow()

[`dispose()`](@/api/reference/#adapter-dispose) disables the adapter and closes active streams. For shared adapters, it also releases the key. Use it at shutdown, not after each request.

[`startFlow(definition, run)`](@/api/reference/#observer-startflow) implements the exported [`FlowObserver`](@/api/reference/#type-flowobserver) contract. Normally pass the adapter as `devtools` to a flow's [`run()`](@/api/reference/#adapter-run); there is no need to invoke observer methods directly.
