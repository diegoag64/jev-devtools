## The drawer is empty

Confirm `enabled: true` on the server and `enabled={true}` on the component in development. Make a request through the client returned by [`inspector.createClient()`](@/api/reference/#adapter-createclient). Creating a second ordinary SDK client bypasses recording.

Then check that inference routes and inspector endpoints use the same instance and process. On Next.js, use a stable [`getJevDevtools()`](@/api/reference/#getjevdevtools) key and restart after changing configuration. Requests in another worker or serverless instance are not aggregated.

## The endpoint returns 403

Compare the configured origin with the browser URL, including scheme, hostname, and port. Check that proxies preserve the path and Host. A cross-origin browser endpoint is unsupported.

Node middleware rejects non-loopback peers without [`authorize`](@/api/reference/#createjevdevtools). Shared or tunneled environments need application authorization. A custom session must resolve consistently for inference and inspection.

## The endpoint returns 404

Disabled adapters intentionally hide their endpoints. In development, confirm the middleware runs before your application's fallback. In Next.js, use `[[...path]]`, not `[...path]`, so the base route exists too. Align custom endpoints in both the server and React component.

## A flow runs but is not recorded

Pass `devtools: inspector` to [`run()`](@/api/reference/#flow-run) and use the instrumented client. Keep the flow and adapter on Node. A definition describes a graph; it does not execute until [`run()`](@/api/reference/#flow-run) is called.

## Configuration changes are ignored

The first options factory passed to [`getJevDevtools()`](@/api/reference/#getjevdevtools) wins for that key. Restart the process after changing origin, redaction, session, or authorization options. Dispose only for shutdown or deliberate reinitialization, not after every request.

## Data looks incomplete

Captures are bounded and can be redacted or truncated. Known credentials cannot be recovered from the inspection copy. The display-masking prop (new in 0.5.0, pending publication) can reveal supported personal fields only if those fields were retained by the server. Use the Questions picker or Raw view for large collections; browser Find does not cover unmounted virtualized cards.
