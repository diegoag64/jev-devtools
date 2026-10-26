Start with the inspector connection, then check capture. Open the base endpoint on your app's browser origin, normally `/api/jev-devtools`. An enabled adapter should return JSON with `enabled: true` and `flows: true`.

If it returns 403 or 404, use the matching section below. If configuration loads but records are missing, start with the empty-drawer checks.

## The drawer is empty

Check these in order:

1. **Enable both parts.** Set `enabled` on the server adapter and React component. Both default to disabled.
2. **Check the event stream.** In the browser's Network panel, the request to `/api/jev-devtools/events` should remain open. If it fails, check its status below. If you changed `endpoint`, use that path instead.
3. **Trigger a new SDK call.** Use the client returned by [`inspector.createClient()`](@/api/reference/#adapter-createclient). Other SDK clients are not captured. A cached page or result may not make a fresh call.
4. **Check the shared adapter.** The inference handler and inspector routes must use the same adapter in the same Node process. In Next.js, import them from one server module using a stable [`getJevDevtools()`](@/api/reference/#getjevdevtools) key.
5. **Check the session scope.** If you configured `getSession`, wrap inference with [`inspector.run(request, callback)`](@/api/reference/#adapter-run). The inference request and drawer requests must resolve to the same trusted scope.

Separate workers or serverless instances have separate histories. Adding another adapter will not combine them. Use [Quick start](@/getting-started/) or [Next.js](@/guides/nextjs/) to compare your wiring with a complete setup.

## The endpoint returns 403

A 403 means an access check rejected the inspector request.

- Compare the browser origin with the server's `origin`: scheme, hostname, and port must match. `localhost` and `127.0.0.1` are different hosts.
- If you use a proxy, preserve the browser's Host and keep inspector requests same-origin. [`handleNodeRoute()`](@/api/reference/#adapter-handlenoderoute) handles framework-internal request URLs but does not trust forwarded host headers.
- With Node middleware and no `authorize`, the connection must come from loopback. Shared or tunneled access needs application authorization.
- If you configured `authorize`, check that the browser sends the credentials your callback expects and that the current user is allowed to inspect.

Use [Privacy & access](@/guides/privacy/#control-who-can-inspect) to configure access for your environment.

## The endpoint returns 404

First check whether recording is disabled. A disabled adapter intentionally hides its endpoints, so a 404 is expected in that case.

If recording should be enabled:

1. Check that the adapter middleware runs before your application's fallback route.
2. In Next.js, name the route folder `[[...path]]`. The optional catch-all includes the base configuration endpoint; `[...path]` only matches its children.
3. Align the server `endpoint`, React `endpoint`, route location, and any application base path. Check the URL the browser actually requests.
4. Restart if you changed options passed to `getJevDevtools()`.

## A flow runs but is not recorded

A flow can execute without inspection. To record it, pass the shared adapter as `devtools: inspector` to [`run()`](@/api/reference/#flow-run) and enable that adapter. Use its instrumented client to capture the linked SDK requests.

Keep the definition, execution, and adapter on Node. Creating a definition does not execute it: call and await `run()`. For a working example and expected records, follow [Build a flow](@/guides/flows/#run-and-inspect-it).

If individual requests are also missing, work through the empty-drawer checks above.

## Configuration changes are ignored

[`getJevDevtools()`](@/api/reference/#getjevdevtools) runs the options factory once for each key. Later calls with that key reuse the existing adapter, including its original configuration.

Restart the server after changing `enabled`, `origin`, redaction, session, or authorization options. Dispose the adapter only for shutdown or deliberate reinitialization. Disposing it after each request or on hot reload prevents it from maintaining shared history.

## Data looks incomplete

Check what kind of data is missing:

| Symptom                         | What to check                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A field is redacted             | Known credentials and values removed by server redaction cannot be recovered from the capture. Check the redaction policy with synthetic data. |
| A personal field is masked      | `redactAdditionalSensitiveData` hides supported fields in the display. Turning it off can reveal only values the server retained.              |
| A value is truncated or omitted | Check capture warnings and the recorder's size, depth, text, collection, and image limits. Application values remain unchanged.                |
| Older requests disappear        | History is bounded. Check `limit`, whether someone cleared the current scope, and whether the process restarted.                               |
| Browser Find misses a question  | Large collections use virtualized cards. Use the Questions picker or Raw view to inspect the complete captured collection.                     |

See [Privacy & access](@/guides/privacy/) for the difference between server redaction, display masking, and retention.
