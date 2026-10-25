## Three pieces, one process

1. **Your SDK client** sends `systemOne` requests. Create it through [`inspector.createClient()`](@/api/reference/#adapter-createclient) so the recorder can observe them.
2. **The Node adapter** keeps bounded request history and serves it over a same-origin event stream.
3. **The React drawer** subscribes to that stream and presents the captured data.

Your application's HTTP handlers and the inspector routes must share the same adapter instance in the same process. The package does not aggregate history across workers, serverless instances, or machines.

## Capture versus display

The recorder observes copies of request and response data. It preserves the original SDK promise, response helpers, cancellation, and application result. Captures have size and depth limits; the inspector marks omitted or truncated data.

Known credential fields are removed from the inspection copy. Use a server [`redact`](@/api/reference/#createjevdevtools) callback for application-specific data that must not reach a browser. The [`redactAdditionalSensitiveData`](@/api/reference/#jevdevtools) prop (new in 0.5.0, pending publication) masks supported personal fields in the display only; it does not remove them from captured or streamed data.

## A request versus a flow

A request is one logical `systemOne` call, potentially with retries. A flow is an optional application-defined sequence of requests, tasks, decisions, and outcomes.

[`defineJevFlow()`](@/api/reference/#definejevflow) builds a definition synchronously. Calling its [`run()`](@/api/reference/#flow-run) method executes a fresh instance. Definition callbacks describe possible paths; only selected paths execute. The graph describes your application, not hidden model reasoning.

## Closing versus disabling

Closing the drawer preserves its controls and retained UI state. The event stream and server capture continue. Disabling or unmounting the React component closes its subscription. Disabling the server adapter stops recording and hides its endpoints, while SDK calls remain ordinary calls.

## Sample versus live

Repository sample apps use the real SDK with fixed response transports. They do not call an inference service, and their answers do not change when you edit the sample context. Live requests use a server-side API key. These docs' interactive preview is an illustration with fixed values.
