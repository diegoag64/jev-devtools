The server adapter combines request capture, HTTP endpoints, and flow observation. Import it from `jev-devtools/server` on Node. The [API glossary](@/api/reference/#server-adapter) has the exact method contracts.

## createJevDevtools(options)

Create an independent adapter when your server owns its lifecycle. Share it between inference handlers and inspector routes in the same Node process. Use [`getJevDevtools()`](#getjevdevtools-key-createoptions) when modules need to reuse an adapter by key.

### Parameters

| Parameter | Type                       | Description                               |
| --------- | -------------------------- | ----------------------------------------- |
| `options` | `JevDevtoolsServerOptions` | Capture and access settings listed below. |

<!-- example: server.ts -->

`inspector` enables recording only in development and checks inspector requests against the configured browser origin. Its `createClient()` method returns `jev`, the SDK client your handlers should use. The key stays on the server.

Creating the adapter and client sends no request. Make an [awaited SDK call](@/getting-started/#5-make-a-request) or pass `jev` to a [flow run](@/api/reference/#flow-jev) to record one.

### Return interface

| Method                       | Return type | Description                                                                       |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `createJevDevtools(options)` | `Adapter`   | Independent adapter with routing, client, session, observer, and cleanup methods. |

## Options

| Option and type                                                                 | Default              | Purpose                                                   |
| ------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------- |
| `origin: string`                                                                | Required             | Exact browser origin, including port.                     |
| `enabled?: boolean`                                                             | `false`              | Enable capture and inspector endpoints.                   |
| `endpoint?: string`                                                             | `/api/jev-devtools`  | Absolute path without query or fragment.                  |
| `limit?: number`                                                                | `50`                 | Global maximum retained request traces, clamped to 1–200. |
| `redact?: (path: string[], value: unknown, context: CaptureContext) => unknown` | None                 | Transform captured values before storage or streaming.    |
| `authorize?: (request: Request) => boolean \| Promise<boolean>`                 | None                 | Access check. Required for enabled non-loopback origins.  |
| `getSession?: (request: Request) => string \| Promise<string>`                  | Shared `local` scope | Trusted scope, nonempty and at most 200 characters.       |

These fields make up [`JevDevtoolsServerOptions`](@/api/reference/#type-jevdevtoolsserveroptions). The `limit` and `redact` fields also form [`CaptureOptions`](@/api/reference/#type-captureoptions).

Invalid origin or endpoint configuration throws. An enabled non-loopback origin requires `authorize`. For local Web Request handlers, bind to loopback or provide authorization because the handler cannot inspect the socket address. See [Privacy & access](@/guides/privacy/) before enabling shared or tunneled access.

## createClient(options, metadata?)

Create the client used by the SDK calls you want to capture. This fragment assumes the shared `inspector` above.

### Parameters

| Parameter   | Type                             | Description                                                                |
| ----------- | -------------------------------- | -------------------------------------------------------------------------- |
| `options`   | TypeSafe SDK constructor options | API key, custom fetch, and other SDK settings.                             |
| `metadata?` | `ClientMetadata`                 | Optional `label` and `source`, defaulting to `"Jev request"` and `"live"`. |

[`ClientMetadata`](@/api/reference/#type-clientmetadata) is exported from `jev-devtools/server`.

```ts api=server
const client = inspector.createClient(
  { apiKey: process.env.TYPESAFE_API_KEY },
  { label: "Support triage", source: "live" },
);
```

Calls through `client.systemOne()` are labeled “Support triage” and live. The first argument configures the SDK, while the second only labels its captures.

### Return interface

| Value    | Type             | Description                                                              |
| -------- | ---------------- | ------------------------------------------------------------------------ |
| `client` | `TypeSafeClient` | Instrumented SDK client when enabled; ordinary SDK client when disabled. |

Changing `source` only labels captures; it does not turn live inference into a sample transport. With recording disabled, this method returns an ordinary SDK client. Only `systemOne` calls on the instrumented client are captured.

## HTTP adapters

| Method                                                                 | Use when                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`middleware(req, res, next)`](@/api/reference/#adapter-middleware)    | Your Node application uses Express/Connect-style middleware. Mount at root; unrelated paths call `next`.                           |
| [`handle(request)`](@/api/reference/#adapter-handle)                   | Your framework supplies a Web Request with the actual public URL. Returns a Web Response.                                          |
| [`handleNodeRoute(request)`](@/api/reference/#adapter-handlenoderoute) | A Node framework such as Next reconstructs internal request URLs. Checks Host, normalizes URL, then applies regular access checks. |

### Return interfaces

| Method            | Return type         | Description                                                                   |
| ----------------- | ------------------- | ----------------------------------------------------------------------------- |
| `middleware`      | `Promise<void>`     | Handles the Node response or continues through `next()`.                      |
| `handle`          | `Promise<Response>` | Web response containing configuration, events, clear results, or HTTP errors. |
| `handleNodeRoute` | `Promise<Response>` | Same response contract after Host validation and URL normalization.           |

Route the base path **and all subpaths** to the same adapter. The drawer reads configuration, subscribes to request and flow events, and sends `DELETE /clear` to clear history.

Disabled or unmatched Web Request routes return 404. Access failures return 403. Errors from authorization or session callbacks can reject a Web Request handler. Node middleware contains route errors as HTTP 500 or a destroyed response. See the [stream protocol](https://github.com/diegoag64/jev-devtools/blob/main/docs/stream-protocol.md) when building another viewer.

Flow connections receive an immediate full snapshot. Later changes, including terminal states and clear, coalesce over a fixed 16 ms window that new updates do not extend. Event-loop load can add delay. Slow readers catch up to retained state when ready; reconnects receive another immediate full snapshot. Coalescing reduces repeated updates but does not bound whole-run capture bytes or memory.

## getJevDevtools(key, createOptions)

Get or create a shared adapter for one Node realm. Use a stable key so module reloads can reuse its history.

### Parameters

| Parameter       | Type                             | Description                                                      |
| --------------- | -------------------------------- | ---------------------------------------------------------------- |
| `key`           | `string`                         | Nonblank, app-specific registry key.                             |
| `createOptions` | `() => JevDevtoolsServerOptions` | Synchronous factory called only when an adapter must be created. |

```ts api=server
import { getJevDevtools } from "jev-devtools/server";

const inspector = getJevDevtools("my-app", () => ({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000",
}));
```

`"my-app"` identifies this adapter. Repeated calls with that key reuse it, including its original configuration and history.

### Return interface

| Value       | Type      | Description                                            |
| ----------- | --------- | ------------------------------------------------------ |
| `inspector` | `Adapter` | Existing adapter for this key, or a newly created one. |

The first options stay in effect until disposal or process restart. Restart after changing configuration. Different keys create separate histories, and separate processes never share this registry.

## run(request, callback)

Run a callback in the recording scope selected by [`getSession()`](@/api/reference/#createjevdevtools). Use this wrapper for inference handlers with custom session scopes.

### Parameters

| Parameter  | Type                    | Description                                                  |
| ---------- | ----------------------- | ------------------------------------------------------------ |
| `request`  | `Request`               | Authenticated application request used to resolve the scope. |
| `callback` | `() => T \| Promise<T>` | Work to perform within that scope. May return a promise.     |

In your application handler, where `request` and `input` are already available:

```ts api=server
return inspector.run(request, () => jev.systemOne(input));
```

The adapter resolves the session from `request`, then keeps that scope active while the SDK call runs. Awaiting the wrapper yields the SDK result. Failures propagate to the caller.

### Return interface

| Value                | Type         | Description                                                  |
| -------------------- | ------------ | ------------------------------------------------------------ |
| `inspector.run(...)` | `Promise<T>` | Resolves to the callback's value, or rejects with its error. |

Authenticate the application handler separately. `inspector.run()` selects a recording scope but does not authorize the action.

## dispose() and startFlow()

[`dispose()`](@/api/reference/#adapter-dispose) disables the adapter and closes active streams. For shared adapters, it also releases the key. Use it at shutdown, not after each request.

[`startFlow(definition, run)`](@/api/reference/#observer-startflow) implements the exported [`FlowObserver`](@/api/reference/#type-flowobserver) contract. Normally pass the adapter as `devtools` to a flow's [`run()`](@/api/reference/#flow-run); there is no need to invoke observer methods directly.

| Method                       | Return type                        | Description                                                    |
| ---------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `dispose()`                  | `void`                             | No return data; disables the adapter and closes streams.       |
| `startFlow(definition, run)` | `{ update, request } \| undefined` | Per-run observer hooks, or no hooks when recording is skipped. |
