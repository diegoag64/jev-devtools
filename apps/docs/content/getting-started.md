This walkthrough adds Jev DevTools to an existing React application with a Node server. You need React 18/19, Node 22.12+, and TypeSafe SDK 0.7.x. For the App Router, use the [Next.js guide](@/guides/nextjs/).

## 1. Install the package

```sh
npm install jev-devtools @typesafe-ai/sdk
```

Already have a TypeSafe client? Replace its construction with the instrumented client below. Your existing `systemOne` calls keep their SDK behavior.

## 2. Create a server adapter

<!-- example: server.ts -->

Keep this module on the server. Put `TYPESAFE_API_KEY` in your server environment, never in a `VITE_` or `NEXT_PUBLIC_` variable. This example uses live inference when you call it; it needs a real key. For a no-key first run, use the [independent samples](@/examples/).

The `origin` must be the URL you open in the browser, including scheme, hostname, and port. `localhost` and `127.0.0.1` are different origins.

## 3. Connect the HTTP routes

In Express or Connect, mount the middleware at the root, before your fallback handler:

```ts api=server
import { inspector } from "./server/jev.js";

app.use(inspector.middleware);
// Your application's HTTP handlers use the client from server/jev.ts.
// Call inspector.dispose() when the server shuts down.
```

Here `app` is your existing Express/Connect application. Bind local development servers to loopback. If your frontend runs on a different port, proxy `/api/jev-devtools` and your inference route through the frontend origin. Preserve the full path and Host header; see [access controls](@/guides/privacy/).

For a Vite-only local example, the [independent React + Vite app](https://github.com/diegoag64/jev-devtools/tree/main/examples/react-vite) mounts the adapter in a Vite development plugin and uses fixed responses.

## 4. Mount the drawer

<!-- example: client.tsx -->

`import.meta.env.DEV` is Vite's development flag. Other frameworks should use their equivalent. Both the server and the component are disabled by default; enable each explicitly during development.

## 5. Make a request

Call this function from an existing application HTTP handler:

<!-- example: request.ts -->

Trigger the handler from your app, open the **Jev DevTools** launcher, and select the recorded request. You should see your message in Context and the returned team in Questions. Inspect the returned choice directly; the inspector does not substitute its own highest-probability result.

## Verify your integration

1. Make one request through the instrumented client and confirm it appears.
2. Open Questions, Context, and Raw to compare the capture with your application result.
3. Close and reopen the drawer; your selection should remain while the trace is retained.
4. Confirm production disables both the component and adapter. SDK requests still work when recording is off.

An empty drawer usually means the route and the inference handler use different adapter instances, or the request came from a different client. See [troubleshooting](@/guides/troubleshooting/).
