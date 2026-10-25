This walkthrough adds Jev DevTools to an existing React application with a Node server. For the App Router, use the [Next.js guide](@/guides/nextjs/).

## Compatibility

| Requirement | Supported configuration |
| --- | --- |
| Node.js | **22.12+** for the server adapter and flow execution. Keep credentials on Node; Edge runtimes are unsupported. |
| React / React DOM | Matching **18.x or 19.x** versions. Both are required peers, including for server-only installations. |
| TypeSafe SDK | **0.7.x** (at least 0.7.0 and below 0.8.0); verified with **0.7.0**. Install it in the consuming workspace. |
| TypeScript | **5.4+**; verified with **5.4.5** against the packed package. Flow declarations use `NoInfer`, which older compilers lack. Frameworks and type dependencies may require a newer compiler. |
| Modules | **ESM imports** through export-aware Node or bundler resolution. The package has no CommonJS `require` entry. |

For TypeScript, use compatible `@types/react` and `@types/node` packages and include DOM types for Web `Request`/`Response` APIs. See the [detailed compatibility baseline](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#compatibility-and-public-imports) for the verified type dependencies and compiler settings.

## Public imports

| Import | Where and why |
| --- | --- |
| `jev-devtools` | React client boundary: drawer, browser-safe trace types, and capture-to-fixture helpers. Supports SSR. |
| `jev-devtools/server` | Node only: adapter and recorder. |
| `jev-devtools/flow` | Node only: define/run flows, replay captured answers, and compare fixtures. |

Keep `/server`, `/flow`, and API credentials out of client bundles. Internal paths and `jev-devtools/package.json` are not public exports; inspect the installed version through your package manager.

## 1. Install the package

```sh install
pnpm add jev-devtools @typesafe-ai/sdk
```

Already have a TypeSafe client? Replace its construction with the instrumented client below. Your existing `systemOne` calls keep their SDK behavior.

## 2. Create a server adapter

<!-- example: server.ts -->

Keep this module on the server. Put `TYPESAFE_API_KEY` in your server environment, never in a `VITE_` or `NEXT_PUBLIC_` variable. This example uses live inference when you call it; it needs a real key. For a no-key first run, use the [independent samples](@/examples/).

The required `origin` must be the URL you open in the browser, including scheme, hostname, and port. Supply it even when capture is disabled. `localhost` and `127.0.0.1` are different origins.

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

Call `await classifyMessage("I was charged twice.")` from an existing application HTTP handler. Unlike the flow builder’s `flow.jev()`, the SDK’s `jev.systemOne()` starts a request immediately; await it to read the answer:

<!-- example: request.ts -->

Trigger the handler from your app, open the **Jev DevTools** launcher, and select the recorded request. You should see your message in Context and the returned team in Questions. Inspect the returned choice directly; the inspector does not substitute its own highest-probability result.

## Verify your integration

1. Make one request through the instrumented client and confirm it appears.
2. Open Questions, Context, and Raw to compare the capture with your application result.
3. Close and reopen the drawer; your selection should remain while the trace is retained.
4. Confirm production disables both the component and adapter. SDK requests still work when recording is off.

An empty drawer usually means the route and the inference handler use different adapter instances, or the request came from a different client. See [troubleshooting](@/guides/troubleshooting/).

## Look up an API

The [API glossary](@/api/reference/) lists each method’s inputs and return value. Ready to connect multiple steps? Start with [Flows from scratch](@/guides/flow-basics/).
