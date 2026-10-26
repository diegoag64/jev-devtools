Capture a TypeSafe request from your app and inspect its context and answer in the browser. We'll connect a Vite React frontend to an existing Express server.

For Next.js App Router, use the [Next.js guide](@/guides/nextjs/). To try the inspector without an API key, run the [sample React + Vite app](@/examples/).

<a id="compatibility"></a>

## Before you begin

Use an app with these dependencies:

- Node **22.12+** and ESM imports on the server.
- Matching React and React DOM **18.x or 19.x** versions.
- TypeSafe SDK **0.7.x** and a server-side API key.
- TypeScript **5.4+** if your app uses TypeScript. Your framework and type packages may require a newer compiler.

See the [compatibility reference](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#compatibility-and-public-imports) for compiler settings and type dependencies.

This walkthrough uses `http://localhost:3000` for the browser and `127.0.0.1:3001` for Express. Keep the backend bound to loopback. For a shared server or tunnel, configure [access controls](@/guides/privacy/) before exposing the inspector.

## 1. Install the package

Install in the workspace that imports the package. If your frontend and server use separate workspaces, install in each one.

```sh install
pnpm add jev-devtools @typesafe-ai/sdk
```

Keep your existing SDK version if it is in the supported 0.7.x range. React and React DOM are required peers even in a server-only workspace.

## 2. Create a server adapter

Set `TYPESAFE_API_KEY` through your server's environment loader. Keep it out of browser variables such as `VITE_*` and `NEXT_PUBLIC_*`. The request in step 5 uses live inference.

Create `server.ts` beside your Express entry point:

<!-- example: server.ts -->

The `origin` is the URL you open in the browser, including its scheme, hostname, and port. Keep it set even when capture is disabled. `localhost` and `127.0.0.1` are different origins.

<a id="public-imports"></a>

Keep this file on Node. Import `jev-devtools` in React and `jev-devtools/server` on the server; never bundle the server module or its key into the frontend. The optional `jev-devtools/flow` entry also belongs on Node. Use only these [public imports](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#compatibility-and-public-imports).

If you already create a TypeSafe client, replace that construction with `inspector.createClient()` and preserve your existing SDK options. Use the returned `jev` client for the calls you want to capture.

## 3. Connect the HTTP routes

In your Express entry point, mount the inspector before your application's fallback handler:

```ts api=server
import { inspector } from "./server.js";

app.use(inspector.middleware);
```

Here `app` is your existing Express application. Configure its existing `listen()` call to use port `3001` and host `127.0.0.1`. Call `inspector.dispose()` when that server shuts down.

Add these server options to your existing `vite.config.ts`. Preserve your plugins and other configuration:

```ts
// Inside defineConfig({ ... }) in vite.config.ts
server: {
  host: "127.0.0.1",
  port: 3000,
  strictPort: true,
  proxy: {
    "/api": {
      target: "http://127.0.0.1:3001",
      changeOrigin: false,
    },
  },
},
```

The proxy sends both inspector and application API requests to Express. It preserves the full path and browser Host header. Merge this rule with any existing `/api` proxy instead of adding a second rule.

Start Express with `NODE_ENV=development`, then start Vite with your app's usual development command. Open `http://localhost:3000/api/jev-devtools` in the browser. You should receive the inspector's JSON configuration. A [403 or 404 response](@/guides/troubleshooting/) means the routes or origin need attention before you continue.

## 4. Mount the drawer

Add `JevDevtools` once in your existing React root. Keep your application's content where this example shows `<main>`:

<!-- example: client.tsx -->

Open `http://localhost:3000`. You should see the **Jev DevTools** launcher. No stylesheet import or provider is needed. Both the server adapter and React component must be enabled; this example uses Vite's `import.meta.env.DEV` flag for the component.

## 5. Make a request

Create `request.ts` beside `server.ts` on your Node server:

<!-- example: request.ts -->

Call `await classifyMessage("I was charged twice.")` from an existing application HTTP handler. That handler must use the same server module and process as the inspector routes. Trigger the handler from your frontend through the `/api` proxy.

The server console prints the model's chosen team: `billing`, `delivery`, or `other`. The choice depends on the response; this is a live request with no predetermined answer.

## Verify your integration

1. Open the **Jev DevTools** launcher and select the recorded request.
2. Open **Context**. Find the message `I was charged twice.`.
3. Open **Questions**. Check that the returned team matches your server log.
4. Open **Raw** to compare the captured response with the application result.
5. Close and reopen the drawer. Your selection should remain while the trace is retained.

If no request appears, check that your handler uses the exported `jev` client rather than another SDK instance. See [The drawer is empty](@/guides/troubleshooting/#the-drawer-is-empty) for the remaining checks.

Before shipping your app, confirm that production disables both the adapter and component. Disabling capture leaves SDK requests working.

## Look up an API

Use the [API glossary](@/api/reference/) for method options and return values. To connect application steps, continue with [Flows from scratch](@/guides/flow-basics/).
